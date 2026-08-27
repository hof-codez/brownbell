// test-per-matchup-finality.js
// Verifies the actual, corrected design: a matchup's OWN win/loss outcome
// depends only on its own 4 players (independent of other games that
// week) - but the TIER and bonus AMOUNT come from ranking all 6 matchups'
// scores against each other in one shared sort, so the bonus for ANY
// matchup isn't genuinely final until EVERY matchup that week has
// concluded, even if this specific one already has.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.NFL_SEASON_YEAR = '2026';

const { createClient } = require('@supabase/supabase-js');
const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

function setupFourTeams(automator) {
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
    automator.getWeeklyScores = async () => ({ p1: 20, p2: 15, p3: 10, p4: 8, p5: 12, p6: 9, p7: 5, p8: 5 });
}

async function seedTeams(supabase) {
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
}

async function run() {
    let allPassed = true;

    // Real week-1 round-robin pairing for 4 teams (sorted by roster_id) is
    // TeamA-vs-TeamD and TeamB-vs-TeamC. A+D share DAL, B+C share KC.

    // --- Scenario 1: DAL concluded, KC still pending ---
    {
        const supabase = createClient();
        await seedTeams(supabase);
        const automator = new BrownBellAutomator('test-league');
        setupFourTeams(automator);
        automator.fetchNFLSchedule = async (week) => {
            const schedule = { DAL: { status: 'post' }, KC: { status: 'pre' } };
            automator.cachedSchedule = automator.cachedSchedule || {};
            automator.cachedSchedule[week] = schedule;
            return schedule;
        };
        process.env.CRON_SCHEDULE = '0 14 * * 2';
        await automator.run();

        const bonusRows = supabase._store.bonus_results.filter(r => r.week === 1);
        const teamA = bonusRows.find(r => r.team_id === 't1');
        const teamB = bonusRows.find(r => r.team_id === 't2');

        allPassed &= check(
            'TeamA-vs-TeamD (DAL, concluded) does NOT show final yet - TeamB-vs-TeamC (KC) is still pending and could still reshuffle the tier ranking',
            teamA?.is_final === false
        );
        allPassed &= check('TeamB-vs-TeamC (KC, still pending) also correctly not final', teamB?.is_final === false);
    }

    // --- Scenario 2: BOTH DAL and KC concluded - the whole week is done ---
    {
        const supabase = createClient();
        await seedTeams(supabase);
        const automator = new BrownBellAutomator('test-league');
        setupFourTeams(automator);
        automator.fetchNFLSchedule = async (week) => {
            const schedule = { DAL: { status: 'post' }, KC: { status: 'post' } };
            automator.cachedSchedule = automator.cachedSchedule || {};
            automator.cachedSchedule[week] = schedule;
            return schedule;
        };
        process.env.CRON_SCHEDULE = '0 14 * * 2';
        await automator.run();

        const bonusRows = supabase._store.bonus_results.filter(r => r.week === 1);
        const allFinal = bonusRows.every(r => r.is_final === true);
        allPassed &= check('Once EVERY matchup that week has concluded, all teams correctly show final', allFinal && bonusRows.length === 4);
    }

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
