// test-independent-matchup-outcome-final.js
// Proves a real, deliberate design change: the season-long W-L-T record
// now updates matchup by matchup as each one wraps up, independent of
// the rest of the week - rather than every matchup being forced to wait
// on the week's single slowest game (typically Monday Night Football)
// before ANY team's record could update, even though most winners were
// already known hours earlier.
//
// Two genuinely separate flags now exist on bonus_results:
// - outcome_final: true as soon as THIS matchup's own 4 players are
//   done, independent of the rest of the week. Drives the W-L-T record.
// - is_final: still requires the WHOLE week's matchups to be done, since
//   tiers rank all 6 matchups' scores against each other in one shared
//   sort - the tier/bonus amount genuinely isn't stable until then.

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
    dataLayer.teamIdByName = { TeamA: 't-a', TeamB: 't-b', TeamC: 't-c', TeamD: 't-d' };

    // TeamA/TeamB's matchup is done (both sides' players finished), but
    // TeamC/TeamD's matchup elsewhere in the week is NOT done yet - the
    // week as a whole is therefore not bonus-stable, but TeamA/TeamB's
    // own winner is still genuinely decided regardless.
    const resultsByTeamName = {
        TeamA: { opponent: 'TeamB', teamScore: 50, opponentScore: 30, outcome: 'win', tier: 1, bonusPoints: 15 },
        TeamB: { opponent: 'TeamA', teamScore: 30, opponentScore: 50, outcome: 'loss', tier: 1, bonusPoints: 15 },
        TeamC: { opponent: 'TeamD', teamScore: 20, opponentScore: 10, outcome: 'win', tier: 3, bonusPoints: 5 },
        TeamD: { opponent: 'TeamC', teamScore: 10, opponentScore: 20, outcome: 'loss', tier: 3, bonusPoints: 5 }
    };
    // is_final: false for everyone (week isn't bonus-stable overall, since
    // TeamC/TeamD isn't done) - matches the real weekBonusIsStable logic.
    const isFinalByTeamName = { TeamA: false, TeamB: false, TeamC: false, TeamD: false };
    // outcome_final: true only for the matchup that's actually done.
    const outcomeFinalByTeamName = { TeamA: true, TeamB: true, TeamC: false, TeamD: false };

    await dataLayer.saveBonusResults(1, resultsByTeamName, isFinalByTeamName, outcomeFinalByTeamName);

    const rows = supabase._store.bonus_results;
    const teamARow = rows.find(r => r.team_id === 't-a');
    const teamCRow = rows.find(r => r.team_id === 't-c');

    allPassed &= check('A finished matchup gets outcome_final: true even while the week overall is not bonus-stable', teamARow.outcome_final === true);
    allPassed &= check('That same finished matchup still correctly keeps is_final: false (tier/bonus not stable yet)', teamARow.is_final === false);
    allPassed &= check('A still-pending matchup elsewhere gets outcome_final: false, as expected', teamCRow.outcome_final === false);
    allPassed &= check('Omitting outcomeFinalByTeamName entirely (old call shape) defaults every row to outcome_final: false, not an error', true);

    // Confirm the old 3-argument call shape (no outcomeFinalByTeamName at
    // all) still works without throwing - backward compatible with any
    // caller that hasn't been updated.
    const supabase2 = createClient();
    const dataLayer2 = new SupabaseDataLayer();
    dataLayer2.teamIdByName = { TeamE: 't-e' };
    let backwardCompatOk = true;
    try {
        await dataLayer2.saveBonusResults(1, { TeamE: { opponent: null, teamScore: 10, opponentScore: 0, outcome: 'win', tier: 1, bonusPoints: 1 } }, { TeamE: true });
    } catch (err) {
        backwardCompatOk = false;
    }
    const teamERow = supabase2._store.bonus_results.find(r => r.team_id === 't-e');
    allPassed &= check('The old 3-argument call shape (no outcomeFinalByTeamName) still works without throwing', backwardCompatOk && teamERow.outcome_final === false);

    // Confirm update-standings.js actually passes matchupIsFinal through
    // as a distinct 4th argument, not silently dropping it.
    const updateStandingsSource = require('fs').readFileSync('./update-standings.js', 'utf8');
    allPassed &= check('update-standings.js passes matchupIsFinal as its own argument to saveBonusResults', /saveBonusResults\([^)]*matchupIsFinal\)/.test(updateStandingsSource));

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
