// test-no-retroactive-swap-midgame.js
// Proves a real, reported bug and its fix: a player locked into a slot
// got injured DURING his own game (already in progress/completed for
// the current week), and was immediately auto-subbed out - retroactively
// replacing his already-accumulating current-week score with the
// substitute's, since the current week's displayed score is computed
// live from whoever is CURRENTLY in the slot. This directly contradicts
// the core "once locked, your points for this game are yours" principle.
//
// The fix: before any revert/injury-swap/departure-swap action, check
// whether the CURRENTLY-set player's own game for the week actually
// being processed has already started - not just the season-long lock
// (always checked against week 1). If it has, skip entirely and defer
// to the following week's own processing.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const { createClient } = require('@supabase/supabase-js');
const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

async function run() {
    let allPassed = true;
    const supabase = createClient();

    await supabase.from('seasons').insert({ id: 's1', year: 2026 });
    await supabase.from('teams').insert({ id: 't1', season_id: 's1', display_name: 'Kenyatta93' });
    await supabase.from('duos').insert([
        { id: 'd1', team_id: 't1', award_type: 'main', player_index: 0, player_name: 'A.J. Brown', player_position: 'WR', sleeper_player_id: 'p-ajbrown', original_sleeper_player_id: 'p-ajbrown', injury_status: 'Out' },
        { id: 'd2', team_id: 't1', award_type: 'main', player_index: 1, player_name: 'Some RB', player_position: 'RB', sleeper_player_id: 'p-rb', original_sleeper_player_id: 'p-rb' }
    ]);

    const automator = new BrownBellAutomator('test-league');
    automator.playersData = {
        'p-ajbrown': { first_name: 'A.J.', last_name: 'Brown', position: 'WR', team: 'PHI', injury_status: 'Out', years_exp: 5 },
        'p-rb': { first_name: 'Some', last_name: 'RB', position: 'RB', team: 'DAL', injury_status: null, years_exp: 3 },
        'p-bench-wr': { first_name: 'Bench', last_name: 'Receiver', position: 'WR', team: 'PHI', injury_status: null, years_exp: 2 }
    };
    automator.leagueData = {
        rosters: [{ owner_id: 'oa', roster_id: 1, players: ['p-ajbrown', 'p-rb', 'p-bench-wr'] }],
        userMap: { oa: 'Kenyatta93' }
    };
    automator.getWeeklyScores = async () => ({});
    await automator.dataLayer.loadSeason(2026, 'test-league');

    // --- The actual reported scenario: A.J. Brown's own Week 1 game has
    //     already started (he got hurt DURING it), and we are still
    //     processing week 1. He must NOT be swapped, since week 1's score
    //     is computed live from whoever's currently in the slot. ---
    automator.hasPlayerGameStarted = async (playerId, week) => week === 1;
    await automator.processDuoSlots(1);

    const d1DuringWeek1 = supabase._store.duos.find(d => d.id === 'd1');
    allPassed &= check('A.J. Brown is NOT swapped out while his own current-week game has already started', d1DuringWeek1.sleeper_player_id === 'p-ajbrown');
    allPassed &= check('His name/position on the slot are completely untouched', d1DuringWeek1.player_name === 'A.J. Brown' && d1DuringWeek1.player_position === 'WR');

    // --- Now processing week 2: season-long lock (week 1) has passed,
    //     but week 2 itself has NOT started for him yet. He's still
    //     injured. THIS is the correct point for the swap to happen. ---
    automator.hasPlayerGameStarted = async (playerId, week) => week === 1;
    automator.cachedSchedule = { 2: { PHI: { date: new Date(Date.now() + 60 * 60000) } } };
    await automator.processDuoSlots(2);

    const d1DuringWeek2 = supabase._store.duos.find(d => d.id === 'd1');
    allPassed &= check('Once a NEW week whose own game has not started is being processed, the still-injured player IS now swapped', d1DuringWeek2.sleeper_player_id === 'p-bench-wr');

    const substitutionLog = supabase._store.substitutions || [];
    const teamId = automator.dataLayer.teamIdByName['Kenyatta93'];
    allPassed &= check('The substitution is logged as a real event, not silently applied', substitutionLog.some(s => s.team_id === teamId && s.substitute_player_id === 'p-bench-wr'));

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
