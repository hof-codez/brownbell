// test-standby-substitutes.js
// Verifies the new standby substitute feature (see
// 033-standby-substitutes.sql): an owner pre-committing a replacement in
// advance for a Monday Night duo member, activated by processDuoSlots
// only when the normal auto-sub rule structurally can't find anyone
// (nothing else that week kicks off later than Monday Night).

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const { createClient } = require('@supabase/supabase-js');
const SupabaseDataLayer = require('./supabase-data-layer.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

async function run() {
    let allPassed = true;
    const supabase = createClient();

    const dataLayer = new SupabaseDataLayer();
    dataLayer.teamIdByName = { TeamA: 't-a', TeamB: 't-b' };

    supabase._store.standby_substitutes = [
        {
            id: 'standby-1', team_id: 't-a', award_type: 'main', player_index: 0, week: 5,
            standby_sleeper_player_id: 'backup-1', standby_player_name: 'Backup Guy', standby_player_position: 'RB',
            covers_sleeper_player_id: 'mnf-player-1', consumed: false
        },
        {
            id: 'standby-2', team_id: 't-a', award_type: 'main', player_index: 1, week: 5,
            standby_sleeper_player_id: 'backup-2', standby_player_name: 'Already Used', standby_player_position: 'WR',
            covers_sleeper_player_id: 'mnf-player-2', consumed: true
        }
    ];

    const found = await dataLayer.getStandbyForSlot('TeamA', 'main', 0, 5, 'mnf-player-1');
    allPassed &= check('getStandbyForSlot finds a matching, un-consumed standby', found !== null && found.standby_player_name === 'Backup Guy');

    const wrongCover = await dataLayer.getStandbyForSlot('TeamA', 'main', 0, 5, 'some-other-player-id');
    allPassed &= check('returns null when coversSleeperPlayerId does not match (slot occupant changed since standby was set)', wrongCover === null);

    const alreadyConsumed = await dataLayer.getStandbyForSlot('TeamA', 'main', 1, 5, 'mnf-player-2');
    allPassed &= check('returns null for an already-consumed standby, never reactivated', alreadyConsumed === null);

    const wrongWeek = await dataLayer.getStandbyForSlot('TeamA', 'main', 0, 6, 'mnf-player-1');
    allPassed &= check('week-specific by design - a standby set for week 5 does not apply to week 6', wrongWeek === null);

    const wrongTeam = await dataLayer.getStandbyForSlot('TeamB', 'main', 0, 5, 'mnf-player-1');
    allPassed &= check('scoped to the correct team - TeamB has no standby here', wrongTeam === null);

    await dataLayer.consumeStandby('standby-1');
    const afterConsume = await dataLayer.getStandbyForSlot('TeamA', 'main', 0, 5, 'mnf-player-1');
    allPassed &= check('consumeStandby marks it used - the same standby cannot be found/reused again after activation', afterConsume === null);

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
