// test-boom-scoring-pipeline.js
// End-to-end test proving a real boom duo flows correctly through the
// entire scoring pipeline: loadKnownDuos() (which crashed in production
// the moment a real boom row existed), updateAllScores() (which silently
// never computed boom scores at all), and saveWeeklyScores() (which would
// have silently dropped any boom scores even if they had been computed).
// All three were found to have the identical gap - this test exercises
// all three together, since that's the actual failure that reached
// production.

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
    await supabase.from('teams').insert({ id: 't1', season_id: 's1', display_name: 'HofDimez' });
    await supabase.from('duos').insert([
        { id: 'd1', team_id: 't1', award_type: 'boom', player_index: 0, player_name: 'Derwin James', player_position: 'DB', sleeper_player_id: 'p-james' },
        { id: 'd2', team_id: 't1', award_type: 'boom', player_index: 1, player_name: 'Danielle Hunter', player_position: 'DE', sleeper_player_id: 'p-hunter' }
    ]);

    const automator = new BrownBellAutomator('test-league');
    await automator.dataLayer.loadSeason(2026, 'test-league');

    let knownDuos;
    try {
        knownDuos = await automator.dataLayer.loadKnownDuos();
    } catch (err) {
        allPassed = check('loadKnownDuos() does not crash on a real boom row', false);
        console.error('  Crashed with:', err.message);
    }
    if (knownDuos) {
        allPassed &= check('loadKnownDuos() does not crash on a real boom row', true);
        allPassed &= check('boom duo correctly loaded with both players', !!knownDuos.boom?.HofDimez?.[0] && !!knownDuos.boom?.HofDimez?.[1]);
        automator.knownDuos = knownDuos;
    }

    automator.playersData = {
        'p-james': { first_name: 'Derwin', last_name: 'James', position: 'DB', team: 'LAC', injury_status: null },
        'p-hunter': { first_name: 'Danielle', last_name: 'Hunter', position: 'DE', team: 'HOU', injury_status: null }
    };
    automator.leagueData = {
        rosters: [{ owner_id: 'oa', roster_id: 1, players: ['p-james', 'p-hunter'] }],
        userMap: { oa: 'HofDimez' }
    };
    automator.hasPlayerGameStarted = async () => true;
    automator.isPlayerOnBye = async () => false;
    automator.getCurrentWeek = async () => 3;
    automator.getWeeklyScores = async () => ({ 'p-james': 12.5, 'p-hunter': 8.0 });

    let scores, playerIds, wasBye;
    try {
        ({ scores, playerIds, wasBye } = await automator.updateAllScores([], [], {}));
    } catch (err) {
        allPassed = check('updateAllScores() does not crash with a boom duo present', false);
        console.error('  Crashed with:', err.message);
    }

    if (scores) {
        allPassed &= check('updateAllScores() does not crash with a boom duo present', true);
        allPassed &= check(
            'updateAllScores() actually computes boom scores, not just main/nextup',
            scores.boom?.HofDimez?.[3]?.[0] === 12.5 && scores.boom?.HofDimez?.[3]?.[1] === 8.0
        );

        await automator.dataLayer.saveWeeklyScores(scores, playerIds, automator.playersData, wasBye);

        const savedBoomRows = supabase._store.weekly_scores.filter(r => r.award_type === 'boom' && r.week === 3);
        allPassed &= check('saveWeeklyScores() actually persists boom rows, not just main/nextup', savedBoomRows.length === 2);
        allPassed &= check(
            'Saved boom rows have the correct points',
            savedBoomRows.some(r => r.sleeper_player_id === 'p-james' && r.points === 12.5) &&
            savedBoomRows.some(r => r.sleeper_player_id === 'p-hunter' && r.points === 8.0)
        );
    }

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
