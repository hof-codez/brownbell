// test-supabase-flow.js
// End-to-end offline test: seeds a mock Supabase store with a season, two teams, and
// duos, then runs the REAL automator.run() -> generateCompleteData() pipeline against
// it (with Sleeper/network calls stubbed) and confirms data actually lands correctly
// in the mock tables. This is the only test that exercises the full live entry point
// (checkpoint-type resolution, schedule handling, processDuoSlots, and every save call
// wired together) rather than calling one method in isolation - valuable specifically
// because it catches wiring bugs unit tests can't see.

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

    // Seed season + teams + duos directly into the mock store. TeamA's default swap
    // state (no per-award swap flags set) means the mock store falls
    // back to { permanentSwapsUsed: 0, manualPrivilege: true } - so this is a team's
    // FIRST permanent departure of the season.
    await supabase.from('seasons').insert({ id: seasonId, year: 2026, current_week: 3, sleeper_league_id: '1313661584425385984' });
    await supabase.from('teams').insert([
        { id: teamAId, season_id: seasonId, sleeper_roster_id: '1', sleeper_owner_id: 'owner1', display_name: 'TeamA', main_permanent_swap_used: false, nextup_permanent_swap_used: false, boom_permanent_swap_used: false },
        { id: teamBId, season_id: seasonId, sleeper_roster_id: '2', sleeper_owner_id: 'owner2', display_name: 'TeamB', main_permanent_swap_used: false, nextup_permanent_swap_used: false, boom_permanent_swap_used: false }
    ]);
    // TeamA's duo shows the original QB (1001) still in slot 0 - but that player has
    // since been dropped from the roster entirely (see the roster stub below).
    await supabase.from('duos').insert([
        { id: 'd1', team_id: teamAId, award_type: 'main', player_index: 0, player_name: 'Original QB', player_position: 'QB', sleeper_player_id: '1001' },
        { id: 'd2', team_id: teamAId, award_type: 'main', player_index: 1, player_name: 'Original RB', player_position: 'RB', sleeper_player_id: '1002' }
    ]);

    const automator = new BrownBellAutomator('1313661584425385984');

    // Stub Sleeper/network-dependent internals
    automator.initializeLeagueData = async () => {
        automator.playersData = {
            '1001': { first_name: 'Original', last_name: 'QB', position: 'QB', team: 'DAL', injury_status: null, years_exp: 5 },
            '1002': { first_name: 'Original', last_name: 'RB', position: 'RB', team: 'DAL', injury_status: null, years_exp: 5 },
            '3003': { first_name: 'Fresh', last_name: 'Candidate', position: 'RB', team: 'DAL', injury_status: null, years_exp: 2 },
            '4004': { first_name: 'Backup', last_name: 'Quarterback', position: 'QB', team: 'DAL', injury_status: null, years_exp: 1 }
        };
        automator.leagueData = {
            rosters: [
                // Original (1001) is gone - traded/released. 1002 (the healthy partner) stays.
                { owner_id: 'owner1', roster_id: 1, players: ['1002', '3003', '4004'] },
                { owner_id: 'owner2', roster_id: 2, players: [] }
            ],
            userMap: { owner1: 'TeamA', owner2: 'TeamB' }
        };
    };
    automator.getCurrentWeek = async () => 3;
    automator.getWeeklyScores = async () => ({});
    automator.hasPlayerGameStarted = async (playerId, week) => week === 1; // locked for the season, no games started this week
    automator.fetchNFLSchedule = async () => ({});
    // resolveVacancy checks the best candidate's own kickoff via
    // isEligibleForSub regardless of award type - the fetchNFLSchedule stub
    // above never populates cachedSchedule internally, so without this the
    // candidate's kickoff reads as "unknown" and is conservatively treated
    // as no time left, triggering immediate auto-fill instead of the
    // intended "clear and wait" path this test is actually checking.
    automator.cachedSchedule = { 3: { DAL: { date: new Date(Date.now() + 120 * 60000) } } };

    process.env.CRON_SCHEDULE = '0 14 * * 2'; // Tuesday full check

    const result = await automator.run();
    console.log('\n=== RUN SUMMARY ===');
    console.log(JSON.stringify(result, null, 2));

    const finalDuos = supabase._store.duos;
    const finalSubs = supabase._store.substitutions;
    console.log('\n=== FINAL DUOS IN MOCK STORE ===');
    console.log(JSON.stringify(finalDuos, null, 2));
    console.log('\n=== FINAL SUBSTITUTIONS IN MOCK STORE ===');
    console.log(JSON.stringify(finalSubs, null, 2));

    const slot0After = finalDuos.find(d => d.team_id === teamAId && d.award_type === 'main' && d.player_index === 0);
    // Cleared but PRESERVED (sleeper_player_id: null, not a deleted row) so
    // original_sleeper_player_id survives for a later re-check - same as
    // boom always did, now the universal pattern for all three awards.
    const slotCleared = slot0After?.sleeper_player_id === null && slot0After?.original_sleeper_player_id === '1001';
    const clearLogged = finalSubs.some(s =>
        s.team_id === teamAId && s.original_name === 'Original QB' && (s.reason || '').includes('cleared')
    );

    console.log('\n--- CHECKS ---');
    console.log(slotCleared ? '✅ This award\'s 1st permanent departure correctly clears the slot (not auto-filled)' : '❌ FAILED - slot missing or still shows a player');
    console.log(clearLogged ? '✅ The clear was logged to substitutions history' : '❌ FAILED - no history entry for the clear');
    process.exit(slotCleared && clearLogged ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
