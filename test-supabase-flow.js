// test-supabase-flow.js
// End-to-end offline test: seeds a mock Supabase store with a season, two teams, and
// duos, then runs generateCompleteData() against it (with Sleeper/network calls stubbed)
// and confirms data actually lands correctly in the mock tables.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.NFL_SEASON_YEAR = '2026';

const { createClient } = require('@supabase/supabase-js');
const BrownBellAutomator = require('./update-standings.js');

async function run() {
    const supabase = createClient();

    const seasonId = 'season-1';
    const teamAId = 'team-a';
    const teamBId = 'team-b';

    // Seed season + teams + duos directly into the mock store
    await supabase.from('seasons').insert({ id: seasonId, year: 2026, current_week: 3, sleeper_league_id: '1313661584425385984' });
    await supabase.from('teams').insert([
        { id: teamAId, season_id: seasonId, sleeper_roster_id: '1', sleeper_owner_id: 'owner1', display_name: 'TeamA' },
        { id: teamBId, season_id: seasonId, sleeper_roster_id: '2', sleeper_owner_id: 'owner2', display_name: 'TeamB' }
    ]);
    await supabase.from('duos').insert([
        { id: 'd1', team_id: teamAId, award_type: 'main', player_index: 0, player_name: 'Original QB', player_position: 'QB', sleeper_player_id: '1001' },
        { id: 'd2', team_id: teamAId, award_type: 'main', player_index: 1, player_name: 'Original RB', player_position: 'RB', sleeper_player_id: '1002' }
    ]);
    // TeamA already has a substitute active for slot 0, but that sub (2002) was dropped
    await supabase.from('substitutions').insert([
        { id: 's1', team_id: teamAId, award_type: 'main', player_index: 0, original_name: 'Original QB', original_position: 'QB',
          substitute_name: 'Dropped Sub', substitute_player_id: '2002', substitute_position: 'RB',
          start_week: 1, end_week: null, active: true, source: 'auto', reason: 'test seed', no_replacement_available: false }
    ]);

    const automator = new BrownBellAutomator('1313661584425385984');

    // Stub Sleeper/network-dependent internals
    automator.initializeLeagueData = async () => {
        automator.playersData = {
            '1001': { first_name: 'Original', last_name: 'QB', position: 'QB', team: 'DAL', injury_status: null, years_exp: 5 },
            '1002': { first_name: 'Original', last_name: 'RB', position: 'RB', team: 'DAL', injury_status: null, years_exp: 5 },
            '2002': { first_name: 'Dropped', last_name: 'Sub', position: 'RB', team: 'DAL', injury_status: null, years_exp: 3 },
            '3003': { first_name: 'Fresh', last_name: 'Candidate', position: 'RB', team: 'DAL', injury_status: null, years_exp: 2 },
            '4004': { first_name: 'Backup', last_name: 'Quarterback', position: 'QB', team: 'DAL', injury_status: null, years_exp: 1 }
        };
        automator.leagueData = {
            rosters: [
                { owner_id: 'owner1', roster_id: 1, players: ['3003', '4004'] }, // original (1001) AND old sub (2002) gone; 4004 (QB) is a valid replacement, 3003 (RB) is not (would make RB+RB)
                { owner_id: 'owner2', roster_id: 2, players: [] }
            ],
            userMap: { owner1: 'TeamA', owner2: 'TeamB' }
        };
    };
    automator.getCurrentWeek = async () => 3;
    automator.getWeeklyScores = async () => ({});
    automator.hasPlayerGameStarted = async () => false;
    automator.fetchNFLSchedule = async () => ({});

    process.env.CRON_SCHEDULE = '0 14 * * 2'; // Tuesday full check

    const result = await automator.run();
    console.log('\n=== RUN SUMMARY ===');
    console.log(JSON.stringify(result, null, 2));

    console.log('\n=== FINAL SUBSTITUTIONS IN MOCK STORE ===');
    const finalSubs = supabase._store.substitutions;
    console.log(JSON.stringify(finalSubs, null, 2));

    const oldSubEnded = finalSubs.find(s => s.id === 's1')?.end_week === 2;
    const newSubInserted = finalSubs.some(s => s.substitute_player_id === '4004' && s.team_id === teamAId);

    console.log('\n--- CHECKS ---');
    console.log(oldSubEnded ? '✅ Old dropped sub correctly closed out in Supabase' : '❌ FAILED - old sub not closed');
    console.log(newSubInserted ? '✅ New replacement correctly inserted into Supabase' : '❌ FAILED - no replacement inserted');
    process.exit(oldSubEnded && newSubInserted ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
