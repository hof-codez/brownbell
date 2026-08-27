// test-weekly-scores-player-index.js
// Verifies: saveWeeklyScores writes player_index (0 or 1) on every row -
// the specific gap that caused the production error.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const { createClient } = require('@supabase/supabase-js');
const SupabaseDataLayer = require('./supabase-data-layer.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

async function run() {
    const supabase = createClient();
    let allPassed = true;

    await supabase.from('seasons').insert({ id: 's1', year: 2026 });
    await supabase.from('teams').insert({ id: 't1', season_id: 's1', display_name: 'TeamA' });

    const dl = new SupabaseDataLayer();
    await dl.loadSeason(2026, 'test-league');

    const scores = { main: { TeamA: { 3: { 0: 20, 1: 15 } } }, nextup: {} };
    const playerIds = { main: { TeamA: { 3: { 0: 'p-slot0', 1: 'p-slot1' } } }, nextup: {} };
    const playersData = {
        'p-slot0': { first_name: 'Slot', last_name: 'Zero', position: 'QB' },
        'p-slot1': { first_name: 'Slot', last_name: 'One', position: 'RB' }
    };
    const wasBye = { main: { TeamA: { 3: { 0: false, 1: false } } }, nextup: {} };

    await dl.saveWeeklyScores(scores, playerIds, playersData, wasBye);

    const rows = supabase._store.weekly_scores;
    const slot0Row = rows.find(r => r.sleeper_player_id === 'p-slot0');
    const slot1Row = rows.find(r => r.sleeper_player_id === 'p-slot1');

    allPassed &= check('Slot 0 row correctly has player_index = 0', slot0Row?.player_index === 0);
    allPassed &= check('Slot 1 row correctly has player_index = 1', slot1Row?.player_index === 1);
    allPassed &= check('Slot 0 row still has the correct points (20)', slot0Row?.points === 20);
    allPassed &= check('Slot 1 row still has the correct points (15)', slot1Row?.points === 15);

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
