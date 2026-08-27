// test-stat-correction-detection.js
// Verifies: saveBonusResults snapshots a correction record ONLY when a row
// that was ALREADY final gets overwritten with genuinely different numbers.

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

    // --- Scenario 1: a genuine correction - already final, numbers change ---
    {
        const supabase = createClient();
        await supabase.from('seasons').insert({ id: 's1', year: 2026 });
        await supabase.from('teams').insert({ id: 't1', season_id: 's1', display_name: 'TeamA' });
        await supabase.from('bonus_results').insert({
            id: 'r1', team_id: 't1', week: 3, opponent_team_id: null,
            team_score: 40, opponent_score: 35, outcome: 'win', tier: 2, bonus_points: 9, is_final: true
        });

        const dl = new SupabaseDataLayer();
        await dl.loadSeason(2026, 'test-league');

        await dl.saveBonusResults(3, {
            TeamA: { opponent: null, teamScore: 43.5, opponentScore: 35, outcome: 'win', tier: 1, bonusPoints: 15 }
        }, { TeamA: true });

        const corrections = supabase._store.bonus_result_corrections || [];
        allPassed &= check('A correction record was logged', corrections.length === 1);
        allPassed &= check('Original score correctly captured (40)', corrections[0]?.original_team_score === 40);
        allPassed &= check('Corrected score correctly captured (43.5)', corrections[0]?.corrected_team_score === 43.5);
        allPassed &= check('Original tier correctly captured (2)', corrections[0]?.original_tier === 2);
        allPassed &= check('Corrected tier correctly captured (1)', corrections[0]?.corrected_tier === 1);

        const updatedRow = supabase._store.bonus_results.find(r => r.team_id === 't1' && r.week === 3);
        allPassed &= check('The actual bonus_results row still gets updated with the corrected value', Number(updatedRow.team_score) === 43.5);
    }

    // --- Scenario 2: normal live update BEFORE finality - not a correction ---
    {
        const supabase = createClient();
        Object.keys(supabase._store).forEach(k => delete supabase._store[k]);
        await supabase.from('seasons').insert({ id: 's2', year: 2026 });
        await supabase.from('teams').insert({ id: 't1', season_id: 's2', display_name: 'TeamA' });
        await supabase.from('bonus_results').insert({
            id: 'r2', team_id: 't1', week: 3, opponent_team_id: null,
            team_score: 20, opponent_score: 10, outcome: 'win', tier: 3, bonus_points: 7, is_final: false
        });

        const dl = new SupabaseDataLayer();
        await dl.loadSeason(2026, 'test-league');

        await dl.saveBonusResults(3, {
            TeamA: { opponent: null, teamScore: 35, opponentScore: 10, outcome: 'win', tier: 2, bonusPoints: 9 }
        }, { TeamA: false });

        const corrections = supabase._store.bonus_result_corrections || [];
        allPassed &= check('NO correction logged for a normal live update before finality', corrections.length === 0);
    }

    // --- Scenario 3: already final, but nothing actually changed ---
    {
        const supabase = createClient();
        Object.keys(supabase._store).forEach(k => delete supabase._store[k]);
        await supabase.from('seasons').insert({ id: 's3', year: 2026 });
        await supabase.from('teams').insert({ id: 't1', season_id: 's3', display_name: 'TeamA' });
        await supabase.from('bonus_results').insert({
            id: 'r3', team_id: 't1', week: 3, opponent_team_id: null,
            team_score: 40, opponent_score: 35, outcome: 'win', tier: 2, bonus_points: 9, is_final: true
        });

        const dl = new SupabaseDataLayer();
        await dl.loadSeason(2026, 'test-league');

        await dl.saveBonusResults(3, {
            TeamA: { opponent: null, teamScore: 40, opponentScore: 35, outcome: 'win', tier: 2, bonusPoints: 9 }
        }, { TeamA: true });

        const corrections = supabase._store.bonus_result_corrections || [];
        allPassed &= check('NO correction logged when the re-written values are identical to what was already there', corrections.length === 0);
    }

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
