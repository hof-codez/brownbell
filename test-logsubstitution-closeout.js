// test-logsubstitution-closeout.js
// Verifies: logSubstitution (the Node/automation-side write path) closes out
// any prior "active" (end_week: null) entry for the same team/award/index
// BEFORE inserting its own new one - even when the prior entry came from a
// completely different source (an owner's pick via set-duo, a separate Deno
// codebase). Without this, an owner's pick followed later by an automation
// auto-fill would leave two simultaneously "active" entries, reintroducing
// the exact ambiguity bug fixed on the set-duo side - just approached from
// the automation's side instead.

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

    await supabase.from('substitutions').insert({
        id: 'owner-entry', team_id: 't1', award_type: 'main', player_index: 0,
        original_name: '(not set)', original_position: '-',
        substitute_name: 'Owner Pick', substitute_player_id: 'p-owner', substitute_position: 'QB',
        start_week: 1, end_week: null, active: true, source: 'owner', reason: 'Owner set pick'
    });

    const dl = new SupabaseDataLayer();
    await dl.loadSeason(2026, 'test-league');

    await dl.logSubstitution({
        teamName: 'TeamA', awardType: 'main', playerIndex: 0,
        originalName: 'Owner Pick', originalPosition: 'QB',
        substituteName: 'Auto Replacement', substitutePlayerId: 'p-auto', substitutePosition: 'QB',
        week: 3, source: 'auto', reason: 'Temporary - Owner Pick is out'
    });

    const rows = supabase._store.substitutions;
    const ownerRow = rows.find(r => r.id === 'owner-entry');
    const autoRow = rows.find(r => r.source === 'auto');

    allPassed &= check('Owner\'s prior entry got closed out (end_week is no longer null)', ownerRow.end_week !== null);
    allPassed &= check('Owner\'s prior entry correctly marked active=false', ownerRow.active === false);
    allPassed &= check('The new automation entry exists with end_week=null (genuinely active now)', !!autoRow && autoRow.end_week === null);
    allPassed &= check(
        'Exactly ONE entry for this slot is active at a time - no more ambiguity',
        rows.filter(r => r.team_id === 't1' && r.award_type === 'main' && r.player_index === 0 && r.end_week === null).length === 1
    );

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
