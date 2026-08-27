// test-per-matchup-finality.js
// Verifies the actual improvement: a matchup's finality depends ONLY on its
// own 4 players, not on unrelated games elsewhere in the week.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.NFL_SEASON_YEAR = '2026';

const { createClient } = require('@supabase/supabase-js');
const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

async function run() {
    const supabase = createClient();
    let allPassed = true;

    await supabase.from('seasons').insert({ id: 's1', year: 2026, current_week: 1, sleeper_league_id: 'test-league' });
    await supabase.from('teams').insert([
        { id: 't1', season_id: 's1', display_name: 'TeamA', permanent_swaps_used: 0, manual_privilege: true },
        { id: 't2', season_id: 's1', display_name: 'TeamB', permanent_swaps_used: 0, manual_privilege: true },
        { id: 't3', season_id: 's1', display_name: 'TeamC', permanent_swaps_used: 0, manual_privilege: true },
        { id: 't4', season_id: 's1', display_name: 'TeamD', permanent_swaps_used: 0, manual_privilege: true }
    ]);
    await supabase.from('duos').insert([
        { id: 'd1', team_id: 't1', award_type: 'main', player_index: 0, player_name: 'A One', player_position: 'QB', sleeper_player_id: 'p1' },
        { id: 'd2', team_id: 't1', award_type: 'main', player_index: 1, player_name: 'A Two', player_position: 'RB', sleeper_player_id: 'p2' },
        { id: 'd3', team_id: 't2', award_type: 'main', player_index: 0, player_name: 'B One', player_position: 'QB', sleeper_player_id: 'p3' },
        { id: 'd4', team_id: 't2', award_type: 'main', player_index: 1, player_name: 'B Two', player_position: 'RB', sleeper_player_id: 'p4' },
        { id: 'd5', team_id: 't3', award_type: 'main', player_index: 0, player_name: 'C One', player_position: 'QB', sleeper_player_id: 'p5' },
        { id: 'd6', team_id: 't3', award_type: 'main', player_index: 1, player_name: 'C Two', player_position: 'RB', sleeper_player_id: 'p6' },
        { id: 'd7', team_id: 't4', award_type: 'main', player_index: 0, player_name: 'D One', player_position: 'QB', sleeper_player_id: 'p7' },
        { id: 'd8', team_id: 't4', award_type: 'main', player_index: 1, player_name: 'D Two', player_position: 'RB', sleeper_player_id: 'p8' }
    ]);

    const automator = new BrownBellAutomator('test-league');
    // Real week-1 round-robin pairing for 4 teams (sorted by roster_id) is
    // TeamA-vs-TeamD and TeamB-vs-TeamC - NOT TeamA-vs-TeamB as might be
    // assumed. Assign NFL teams to match that real pairing: A+D share DAL
    // (already concluded), B+C share KC (still pending).
    automator.initializeLeagueData = async () => {
        automator.playersData = {
            'p1': { first_name: 'A', last_name: 'One', position: 'QB', team: 'DAL', injury_status: null, years_exp: 3 },
            'p2': { first_name: 'A', last_name: 'Two', position: 'RB', team: 'DAL', injury_status: null, years_exp: 3 },
            'p3': { first_name: 'B', last_name: 'One', position: 'QB', team: 'KC', injury_status: null, years_exp: 3 },
            'p4': { first_name: 'B', last_name: 'Two', position: 'RB', team: 'KC', injury_status: null, years_exp: 3 },
            'p5': { first_name: 'C', last_name: 'One', position: 'QB', team: 'KC', injury_status: null, years_exp: 3 },
            'p6': { first_name: 'C', last_name: 'Two', position: 'RB', team: 'KC', injury_status: null, years_exp: 3 },
            'p7': { first_name: 'D', last_name: 'One', position: 'QB', team: 'DAL', injury_status: null, years_exp: 3 },
            'p8': { first_name: 'D', last_name: 'Two', position: 'RB', team: 'DAL', injury_status: null, years_exp: 3 }
        };
        automator.leagueData = {
            rosters: [
                { owner_id: 'oa', roster_id: 1, players: ['p1', 'p2'] },
                { owner_id: 'ob', roster_id: 2, players: ['p3', 'p4'] },
                { owner_id: 'oc', roster_id: 3, players: ['p5', 'p6'] },
                { owner_id: 'od', roster_id: 4, players: ['p7', 'p8'] }
            ],
            userMap: { oa: 'TeamA', ob: 'TeamB', oc: 'TeamC', od: 'TeamD' }
        };
    };
    automator.getCurrentWeek = async () => 1;
    automator.hasPlayerGameStarted = async () => false;
    automator.getWeeklyScores = async () => ({ p1: 20, p2: 15, p3: 10, p4: 8, p5: 12, p6: 9, p7: 0, p8: 0 });

    automator.fetchNFLSchedule = async (week) => {
        const schedule = { DAL: { status: 'post' }, KC: { status: 'pre' } };
        automator.cachedSchedule = automator.cachedSchedule || {};
        automator.cachedSchedule[week] = schedule;
        return schedule;
    };

    process.env.CRON_SCHEDULE = '0 14 * * 2';
    await automator.run();

    const bonusRows = supabase._store.bonus_results.filter(r => r.week === 1);
    const teamARow = bonusRows.find(r => r.team_id === 't1');
    const teamBRow = bonusRows.find(r => r.team_id === 't2');
    const teamCRow = bonusRows.find(r => r.team_id === 't3');
    const teamDRow = bonusRows.find(r => r.team_id === 't4');

    allPassed &= check('Matchup 1 (TeamA vs TeamD, both DAL, game already concluded) IS final', teamARow?.is_final === true && teamDRow?.is_final === true);
    allPassed &= check('Matchup 2 (TeamB vs TeamC, both KC, game still pending) is NOT final', teamBRow?.is_final === false && teamCRow?.is_final === false);
    allPassed &= check(
        'This is genuinely independent - one matchup finalized while the OTHER matchup in the exact same week/run stayed live',
        teamARow?.is_final === true && teamBRow?.is_final === false
    );

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
