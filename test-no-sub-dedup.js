// test-no-sub-dedup.js
// Verifies: a "no eligible replacement" situation that hasn't changed
// doesn't get re-logged on every watchdog run (previously flooded History
// with duplicate, identical entries - confirmed as a real reported case,
// 6 back-to-back duplicates for one player in one week). A genuine change
// (the player's status moving from Out to IR, say) still logs its own new
// entry rather than being silently swallowed by the same guard.

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
    const seasonId = 's1';
    const teamId = 'team-a';

    await supabase.from('seasons').insert({ id: seasonId, year: 2026, current_week: 3 });
    await supabase.from('teams').insert({ id: teamId, season_id: seasonId, display_name: 'TeamA', main_permanent_swap_used: false, nextup_permanent_swap_used: false, boom_permanent_swap_used: false });
    await supabase.from('duos').insert([
        { id: 'd1', team_id: teamId, award_type: 'main', player_index: 0, player_name: 'Hurt QB', player_position: 'QB', sleeper_player_id: 'p-hurt', source: 'import' },
        { id: 'd2', team_id: teamId, award_type: 'main', player_index: 1, player_name: 'Healthy RB', player_position: 'RB', sleeper_player_id: 'p-healthy', source: 'import' }
    ]);

    const automator = new BrownBellAutomator('test-league');
    automator.playersData = {
        'p-hurt': { first_name: 'Hurt', last_name: 'QB', position: 'QB', team: 'DAL', injury_status: 'Out', years_exp: 5 },
        'p-healthy': { first_name: 'Healthy', last_name: 'RB', position: 'RB', team: 'DAL', injury_status: null, years_exp: 5 }
    };
    automator.leagueData = {
        rosters: [{ owner_id: 'oa', roster_id: 1, players: ['p-hurt', 'p-healthy'] }],
        userMap: { oa: 'TeamA' }
    };
    automator.hasPlayerGameStarted = async (id, week) => week === 1;
    automator.isPlayerOnBye = async () => false;
    automator.getWeeklyScores = async () => ({});

    await automator.dataLayer.loadSeason(2026, 'test-league');

    // Run 1: nothing logged yet, so this should create the entry - mirrors
    // a fresh watchdog checkpoint hitting this situation for the first time.
    const events1 = await automator.processDuoSlots(3, await automator.dataLayer.loadSubstitutions());
    const logRowsAfterRun1 = supabase._store.substitutions.filter(s => s.team_id === teamId && s.no_replacement_available === true);
    allPassed &= check('Run 1 (first time seeing this): exactly one entry logged', logRowsAfterRun1.length === 1);
    allPassed &= check('Run 1: an event was pushed', events1.some(e => e.type === 'no-replacement'));

    // Run 2: same unchanged situation (still Out, still no replacement) -
    // this is the exact repeated-watchdog-run scenario. Loads the fresh
    // substitutions list first, same as a real run would, so run 2 actually
    // sees what run 1 just wrote.
    const substitutionsBeforeRun2 = await automator.dataLayer.loadSubstitutions();
    const events2 = await automator.processDuoSlots(3, substitutionsBeforeRun2);
    const logRowsAfterRun2 = supabase._store.substitutions.filter(s => s.team_id === teamId && s.no_replacement_available === true);
    allPassed &= check('Run 2 (unchanged situation): still exactly one entry - no duplicate added', logRowsAfterRun2.length === 1);
    allPassed &= check('Run 2: no new event pushed for an unchanged situation', !events2.some(e => e.type === 'no-replacement'));

    // Run 3: the player's status actually changes (Out -> IR) - the reason
    // text differs now, so this must log its own new entry rather than
    // being swallowed by the same guard that correctly suppressed run 2.
    automator.playersData['p-hurt'].injury_status = 'IR';
    const substitutionsBeforeRun3 = await automator.dataLayer.loadSubstitutions();
    const events3 = await automator.processDuoSlots(3, substitutionsBeforeRun3);
    const logRowsAfterRun3 = supabase._store.substitutions.filter(s => s.team_id === teamId && s.no_replacement_available === true);
    allPassed &= check('Run 3 (genuine status change Out -> IR): a second, distinct entry was logged', logRowsAfterRun3.length === 2);
    allPassed &= check('Run 3: an event was pushed for the genuine change', events3.some(e => e.type === 'no-replacement'));
    allPassed &= check('Run 3: the two logged entries have different reason text', logRowsAfterRun1[0].reason !== logRowsAfterRun3.find(r => r.id !== logRowsAfterRun1[0].id)?.reason);

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
