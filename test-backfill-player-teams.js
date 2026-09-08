// test-backfill-player-teams.js
// Proves backfillPlayerTeams() catches up existing duos rows written
// before player_team existed. A real production gap: ordinary operation
// only ever writes player_team through upsertDuoSlot, which fires only on
// an actual change (injury, departure, revert) - a healthy, untouched
// pick from before the column existed would otherwise never get it
// populated no matter how many times the automation runs.

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
    await supabase.from('teams').insert({ id: 't1', season_id: 's1', display_name: 'TeamA' });

    await supabase.from('duos').insert([
        { id: 'd1', team_id: 't1', award_type: 'main', player_index: 0, player_name: 'Old Pick', player_position: 'RB', sleeper_player_id: 'p-old', player_team: null },
        { id: 'd2', team_id: 't1', award_type: 'main', player_index: 1, player_name: 'Already Set', player_position: 'WR', sleeper_player_id: 'p-set', player_team: 'KC' },
        { id: 'd3', team_id: 't1', award_type: 'nextup', player_index: 0, player_name: '', player_position: '', sleeper_player_id: null, player_team: null }
    ]);

    const automator = new BrownBellAutomator('test-league');
    await automator.dataLayer.loadSeason(2026, 'test-league');
    automator.dataLayer.playersData = {
        'p-old': { first_name: 'Old', last_name: 'Pick', position: 'RB', team: 'DAL' },
        'p-set': { first_name: 'Already', last_name: 'Set', position: 'WR', team: 'GB' }
    };

    await automator.dataLayer.backfillPlayerTeams();

    const d1 = supabase._store.duos.find(d => d.id === 'd1');
    allPassed &= check('Pre-existing null row backfilled with the correct team', d1.player_team === 'DAL');

    const d2 = supabase._store.duos.find(d => d.id === 'd2');
    allPassed &= check('Row that already had a value is left untouched', d2.player_team === 'KC');

    const d3 = supabase._store.duos.find(d => d.id === 'd3');
    allPassed &= check('Empty slot (no sleeper_player_id) is skipped without erroring', d3.player_team === null);

    await automator.dataLayer.backfillPlayerTeams();
    const d1Again = supabase._store.duos.find(d => d.id === 'd1');
    allPassed &= check('A second run is a no-op - already-backfilled row is unaffected', d1Again.player_team === 'DAL');

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
