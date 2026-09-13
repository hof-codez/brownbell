// test-prelock-departed-flag.js
// Proves pre-lock roster-change awareness: a duo slot whose player has
// already left this team's actual Sleeper roster (a fantasy trade before
// their game locks) gets flagged so the frontend can show a clear
// "no longer on roster" indicator, rather than silently displaying a
// stale name as if nothing happened. Modeled directly on a real reported
// incident.
//
// Deliberately does NOT auto-clear or auto-sub the pre-lock slot itself -
// that stays fully owner-editable, unchanged. This is read-only awareness
// only.
//
// Also proves the distinct "this week's own lock" check added after a
// separate real reported bug: a permanent departure only gets actively
// resolved once we're processing a week whose OWN game for this player
// hasn't started yet - never the same week in which their game already
// started, since that would retroactively replace an already-locked-in
// week's performance. The season-long lock (always checked against week
// 1) and "this specific week's own game" are two different questions -
// week 2's processing below is where the departure should actually
// resolve, not a second call still processing week 1.

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
    await supabase.from('teams').insert([
        { id: 't1', season_id: 's1', display_name: 'TeamA' },
        { id: 't2', season_id: 's1', display_name: 'TeamB' }
    ]);

    await supabase.from('duos').insert([
        { id: 'd1', team_id: 't1', award_type: 'nextup', player_index: 0, player_name: 'Rome Odunze', player_position: 'WR', sleeper_player_id: 'p-odunze', original_sleeper_player_id: null, player_departed: false },
        { id: 'd2', team_id: 't1', award_type: 'nextup', player_index: 1, player_name: 'RJ Harvey', player_position: 'RB', sleeper_player_id: 'p-harvey', original_sleeper_player_id: null, player_departed: false }
    ]);

    const automator = new BrownBellAutomator('test-league');
    automator.playersData = {
        'p-odunze': { first_name: 'Rome', last_name: 'Odunze', position: 'WR', team: 'CHI', injury_status: null, years_exp: 1 },
        'p-harvey': { first_name: 'RJ', last_name: 'Harvey', position: 'RB', team: 'DEN', injury_status: null, years_exp: 0 },
        'p-bench-wr': { first_name: 'Bench', last_name: 'Receiver', position: 'WR', team: 'CHI', injury_status: null, years_exp: 1 }
    };
    automator.leagueData = {
        rosters: [
            { owner_id: 'oa', roster_id: 1, players: ['p-harvey', 'p-bench-wr'] },
            { owner_id: 'ob', roster_id: 2, players: ['p-odunze'] }
        ],
        userMap: { oa: 'TeamA', ob: 'TeamB' }
    };
    automator.hasPlayerGameStarted = async () => false;
    automator.getWeeklyScores = async () => ({});
    await automator.dataLayer.loadSeason(2026, 'test-league');

    await automator.processDuoSlots(1);

    const d1 = supabase._store.duos.find(d => d.id === 'd1');
    allPassed &= check('Odunze\'s slot gets flagged as departed (traded away, pre-lock)', d1.player_departed === true);
    allPassed &= check('Odunze\'s name/pick is otherwise left completely untouched - still fully owner-editable', d1.sleeper_player_id === 'p-odunze' && d1.player_name === 'Rome Odunze');

    const d2 = supabase._store.duos.find(d => d.id === 'd2');
    allPassed &= check('Harvey\'s slot (still genuinely on the roster) is NOT flagged', d2.player_departed === false);

    // Season-long lock (always week 1) has now passed, but week 2 - the
    // week actually being processed next - hasn't started for anyone yet.
    // This is the correct scenario for the departure to actually resolve:
    // week 1's own game (and whatever Odunze already earned in it, had he
    // played) is never touched; only the NEW, not-yet-started week ahead
    // gets a real replacement decision.
    automator.hasPlayerGameStarted = async (playerId, week) => week === 1;
    automator.cachedSchedule = { 2: { CHI: { date: new Date(Date.now() + 60 * 60000) } } };
    await automator.processDuoSlots(2);

    const d1AfterLock = supabase._store.duos.find(d => d.id === 'd1');
    allPassed &= check('Once locked AND processing a new week whose own game has not started, the slot is actively cleared', d1AfterLock.sleeper_player_id === null);
    allPassed &= check('The departed flag is cleared once the slot is actively resolved', d1AfterLock.player_departed === false);

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});

