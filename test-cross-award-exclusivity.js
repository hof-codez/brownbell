// test-cross-award-exclusivity.js
// Verifies: a player currently used in a team's Main Award duo can never be
// auto-selected as a Next Up replacement for that same team, and vice versa.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const { createClient } = require('@supabase/supabase-js');
const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

async function run() {
    const supabase = createClient();
    let allPassed = true;

    const seasonId = 's1';
    const teamId = 'team-x';

    await supabase.from('seasons').insert({ id: seasonId, year: 2026, current_week: 3 });
    await supabase.from('teams').insert({ id: teamId, season_id: seasonId, display_name: 'TeamX', permanent_swaps_used: 0, manual_privilege: true });

    await supabase.from('duos').insert([
        // Main Award: p-main-hurt (locked, about to be injured) + p-main-healthy
        { id: 'd1', team_id: teamId, award_type: 'main', player_index: 0, player_name: 'Hurt Main', player_position: 'QB', sleeper_player_id: 'p-main-hurt', source: 'import' },
        { id: 'd2', team_id: teamId, award_type: 'main', player_index: 1, player_name: 'Healthy Main', player_position: 'RB', sleeper_player_id: 'p-main-healthy', source: 'import' },
        // Next Up: two players already in use - these must NEVER be picked as the Main replacement
        { id: 'd3', team_id: teamId, award_type: 'nextup', player_index: 0, player_name: 'NextUp A', player_position: 'WR', sleeper_player_id: 'p-nextup-a', source: 'import' },
        { id: 'd4', team_id: teamId, award_type: 'nextup', player_index: 1, player_name: 'NextUp B', player_position: 'TE', sleeper_player_id: 'p-nextup-b', source: 'import' }
    ]);

    const automator = new BrownBellAutomator('test-league');

    // Only ONE roster player (p-only-eligible) is NOT already used in either
    // award - if cross-award exclusion works, that's the only one that can
    // ever get picked, no matter how many times this runs.
    automator.playersData = {
        'p-main-hurt': { first_name: 'Hurt', last_name: 'Main', position: 'QB', team: 'DAL', injury_status: 'Out', years_exp: 5 },
        'p-main-healthy': { first_name: 'Healthy', last_name: 'Main', position: 'RB', team: 'DAL', injury_status: null, years_exp: 5 },
        'p-nextup-a': { first_name: 'NextUp', last_name: 'A', position: 'WR', team: 'DAL', injury_status: null, years_exp: 1 },
        'p-nextup-b': { first_name: 'NextUp', last_name: 'B', position: 'TE', team: 'DAL', injury_status: null, years_exp: 2 },
        'p-only-eligible': { first_name: 'Only', last_name: 'Eligible', position: 'WR', team: 'DAL', injury_status: null, years_exp: 4 }
    };

    automator.leagueData = {
        rosters: [{
            owner_id: 'ox', roster_id: 1,
            players: ['p-main-hurt', 'p-main-healthy', 'p-nextup-a', 'p-nextup-b', 'p-only-eligible']
        }],
        userMap: { ox: 'TeamX' }
    };

    automator.hasPlayerGameStarted = async (playerId, week) => week === 1; // everyone is locked (week 1 already happened), but no one's game has started for THIS week yet
    automator.isPlayerOnBye = async () => false;
    automator.getWeeklyScores = async () => ({ 'p-only-eligible': 20 });

    await automator.dataLayer.loadSeason(2026, 'test-league');
    await automator.processDuoSlots(3);

    const mainSlot0After = supabase._store.duos.find(d => d.team_id === teamId && d.award_type === 'main' && d.player_index === 0);

    allPassed &= check('Main slot 0 got auto-filled (no longer the injured original)', mainSlot0After.sleeper_player_id !== 'p-main-hurt');
    allPassed &= check(
        'The auto-fill picked "Only Eligible" - NOT either Next Up player, even though they were on the roster',
        mainSlot0After.sleeper_player_id === 'p-only-eligible'
    );
    allPassed &= check(
        'Explicitly confirms neither Next Up player was double-booked into Main',
        mainSlot0After.sleeper_player_id !== 'p-nextup-a' && mainSlot0After.sleeper_player_id !== 'p-nextup-b'
    );

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
