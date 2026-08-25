// test-preseason-bonus-gate.js
// Verifies the actual reported bug is fixed: before Sleeper has posted any
// real stat data for a week (pre-season, or just before that week's games
// start), every team's total is genuinely 0 - not because they tied, but
// because nothing has been played. The automation must not save that as a
// real "0-0 tie" with real bonus points, and must clean up any such rows
// that got saved before this check existed.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.NFL_SEASON_YEAR = '2026';

const { createClient } = require('@supabase/supabase-js');
const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

function baseSetup() {
    const automator = new BrownBellAutomator('test-league');
    automator.initializeLeagueData = async () => {
        automator.playersData = {
            'p1': { first_name: 'A', last_name: 'One', position: 'QB', team: 'DAL', injury_status: null, years_exp: 3 },
            'p2': { first_name: 'B', last_name: 'Two', position: 'RB', team: 'DAL', injury_status: null, years_exp: 3 }
        };
        automator.leagueData = {
            rosters: [{ owner_id: 'oa', roster_id: 1, players: ['p1', 'p2'] }],
            userMap: { oa: 'TeamA' }
        };
    };
    automator.getCurrentWeek = async () => 1;
    automator.hasPlayerGameStarted = async () => false;
    automator.fetchNFLSchedule = async () => ({});
    return automator;
}

async function run() {
    let allPassed = true;

    // --- Scenario 1: pre-season, no real data - the reported bug ---
    {
        const supabase = createClient();
        await supabase.from('seasons').insert({ id: 's1', year: 2026, current_week: 1, sleeper_league_id: 'test-league' });
        await supabase.from('teams').insert({ id: 't1', season_id: 's1', display_name: 'TeamA', permanent_swaps_used: 0, manual_privilege: true });
        await supabase.from('duos').insert([
            { id: 'd1', team_id: 't1', award_type: 'main', player_index: 0, player_name: 'A One', player_position: 'QB', sleeper_player_id: 'p1' },
            { id: 'd2', team_id: 't1', award_type: 'main', player_index: 1, player_name: 'B Two', player_position: 'RB', sleeper_player_id: 'p2' }
        ]);
        await supabase.from('bonus_results').insert({
            id: 'stale', team_id: 't1', week: 1, opponent_team_id: null,
            team_score: 0, opponent_score: 0, outcome: 'tie', tier: 1, bonus_points: 7.5
        });

        const automator = baseSetup();
        // Realistic pre-season mock: Sleeper's matchups endpoint appears to
        // pre-populate every rostered player's entry at 0 points before any
        // games start, rather than returning an empty structure - this is
        // what actually tripped up the first version of this fix, which
        // only checked for key presence.
        automator.getWeeklyScores = async () => ({ p1: 0, p2: 0 });

        process.env.CRON_SCHEDULE = '0 14 * * 2';
        await automator.run();

        const bonusRows = supabase._store.bonus_results.filter(r => r.week === 1);
        allPassed &= check('Pre-season run with no real data clears the stale fake result entirely', bonusRows.length === 0);
    }

    // --- Scenario 2: real data exists - bonus computation should still work normally ---
    {
        const supabase = createClient();
        await supabase.from('seasons').insert({ id: 's2', year: 2026, current_week: 1, sleeper_league_id: 'test-league' });
        await supabase.from('teams').insert([
            { id: 't1', season_id: 's2', display_name: 'TeamA', permanent_swaps_used: 0, manual_privilege: true },
            { id: 't2', season_id: 's2', display_name: 'TeamB', permanent_swaps_used: 0, manual_privilege: true }
        ]);
        await supabase.from('duos').insert([
            { id: 'd1', team_id: 't1', award_type: 'main', player_index: 0, player_name: 'A One', player_position: 'QB', sleeper_player_id: 'p1' },
            { id: 'd2', team_id: 't1', award_type: 'main', player_index: 1, player_name: 'B Two', player_position: 'RB', sleeper_player_id: 'p2' },
            { id: 'd3', team_id: 't2', award_type: 'main', player_index: 0, player_name: 'C Three', player_position: 'QB', sleeper_player_id: 'p3' },
            { id: 'd4', team_id: 't2', award_type: 'main', player_index: 1, player_name: 'D Four', player_position: 'RB', sleeper_player_id: 'p4' }
        ]);

        const automator = baseSetup();
        automator.initializeLeagueData = async () => {
            automator.playersData = {
                'p1': { first_name: 'A', last_name: 'One', position: 'QB', team: 'DAL', injury_status: null, years_exp: 3 },
                'p2': { first_name: 'B', last_name: 'Two', position: 'RB', team: 'DAL', injury_status: null, years_exp: 3 },
                'p3': { first_name: 'C', last_name: 'Three', position: 'QB', team: 'DAL', injury_status: null, years_exp: 3 },
                'p4': { first_name: 'D', last_name: 'Four', position: 'RB', team: 'DAL', injury_status: null, years_exp: 3 }
            };
            automator.leagueData = {
                rosters: [
                    { owner_id: 'oa', roster_id: 1, players: ['p1', 'p2'] },
                    { owner_id: 'ob', roster_id: 2, players: ['p3', 'p4'] }
                ],
                userMap: { oa: 'TeamA', ob: 'TeamB' }
            };
        };
        automator.getWeeklyScores = async () => ({ p1: 20, p2: 15, p3: 5, p4: 3 });

        process.env.CRON_SCHEDULE = '0 14 * * 2';
        await automator.run();

        const bonusRows = supabase._store.bonus_results.filter(r => r.week === 1);
        allPassed &= check('Once real data exists, bonus results ARE computed and saved normally', bonusRows.length === 1);
        allPassed &= check('The saved result correctly reflects the real 35-point total, not a fake 0', bonusRows[0]?.team_score === 35);
    }

    // --- Scenario 3: mixed week - some players have real scores, others
    // still 0 because their game hasn't started yet (Thursday happened,
    // Sunday hasn't). This should count as "the week has started". ---
    {
        const supabase = createClient();
        await supabase.from('seasons').insert({ id: 's3', year: 2026, current_week: 1, sleeper_league_id: 'test-league' });
        await supabase.from('teams').insert([
            { id: 't1', season_id: 's3', display_name: 'TeamA', permanent_swaps_used: 0, manual_privilege: true },
            { id: 't2', season_id: 's3', display_name: 'TeamB', permanent_swaps_used: 0, manual_privilege: true }
        ]);
        await supabase.from('duos').insert([
            { id: 'd1', team_id: 't1', award_type: 'main', player_index: 0, player_name: 'A One', player_position: 'QB', sleeper_player_id: 'p1' },
            { id: 'd2', team_id: 't1', award_type: 'main', player_index: 1, player_name: 'B Two', player_position: 'RB', sleeper_player_id: 'p2' },
            { id: 'd3', team_id: 't2', award_type: 'main', player_index: 0, player_name: 'C Three', player_position: 'QB', sleeper_player_id: 'p3' },
            { id: 'd4', team_id: 't2', award_type: 'main', player_index: 1, player_name: 'D Four', player_position: 'RB', sleeper_player_id: 'p4' }
        ]);

        const automator = baseSetup();
        automator.initializeLeagueData = async () => {
            automator.playersData = {
                'p1': { first_name: 'A', last_name: 'One', position: 'QB', team: 'DAL', injury_status: null, years_exp: 3 },
                'p2': { first_name: 'B', last_name: 'Two', position: 'RB', team: 'DAL', injury_status: null, years_exp: 3 },
                'p3': { first_name: 'C', last_name: 'Three', position: 'QB', team: 'DAL', injury_status: null, years_exp: 3 },
                'p4': { first_name: 'D', last_name: 'Four', position: 'RB', team: 'DAL', injury_status: null, years_exp: 3 }
            };
            automator.leagueData = {
                rosters: [
                    { owner_id: 'oa', roster_id: 1, players: ['p1', 'p2'] },
                    { owner_id: 'ob', roster_id: 2, players: ['p3', 'p4'] }
                ],
                userMap: { oa: 'TeamA', ob: 'TeamB' }
            };
        };
        // p1/p2 (Thursday night, already played) have real points; p3/p4
        // (Sunday, hasn't started) are still genuinely 0.
        automator.getWeeklyScores = async () => ({ p1: 18, p2: 0, p3: 0, p4: 0 });

        process.env.CRON_SCHEDULE = '0 14 * * 2';
        await automator.run();

        const bonusRows = supabase._store.bonus_results.filter(r => r.week === 1);
        allPassed &= check(
            'Mixed week (one real score among mostly-zero) correctly counts as started - bonus results ARE saved',
            bonusRows.length === 1
        );
    }

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
