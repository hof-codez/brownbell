// test-weekly-recap-generation.js
// Verifies the new weekly recap feature: matchup summaries, top scorer,
// league-wide prediction accuracy (majority pick vs actual outcome,
// distinct from any individual owner's own prediction bonus), and the
// generate-once/never-silently-overwrite behavior of
// saveWeeklyRecapIfNotExists - a link someone has already been given
// shouldn't change under them later.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const { createClient } = require('@supabase/supabase-js');
const SupabaseDataLayer = require('./supabase-data-layer.js');
const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

async function run() {
    let allPassed = true;
    const supabase = createClient();

    const automator = new BrownBellAutomator('fake-league-id');
    automator.dataLayer = new SupabaseDataLayer();
    automator.dataLayer.teamIdByName = { TeamA: 't-a', TeamB: 't-b', TeamC: 't-c', TeamD: 't-d' };
    automator.knownDuos = { main: { TeamA: [], TeamB: [], TeamC: [], TeamD: [] } };
    automator.playersData = {
        'p1': { first_name: 'Josh', last_name: 'Allen', position: 'QB' },
        'p2': { first_name: 'Chris', last_name: 'Olave', position: 'WR' },
        'p3': { first_name: 'Nobody', last_name: 'Special', position: 'RB' }
    };

    // TeamA beats TeamB 80-30 (blowout); TeamC beats TeamD 51-50 (closest).
    const brownBellMatchups = [['TeamA', 'TeamB'], ['TeamC', 'TeamD']];
    const brownBellBonuses = {
        TeamA: { opponent: 'TeamB', teamScore: 80, opponentScore: 30, outcome: 'win', tier: 1, bonusPoints: 15 },
        TeamB: { opponent: 'TeamA', teamScore: 30, opponentScore: 80, outcome: 'loss', tier: null, bonusPoints: 0 },
        TeamC: { opponent: 'TeamD', teamScore: 51, opponentScore: 50, outcome: 'win', tier: 2, bonusPoints: 9 },
        TeamD: { opponent: 'TeamC', teamScore: 50, opponentScore: 51, outcome: 'loss', tier: null, bonusPoints: 0 }
    };
    const allScores = {
        main: {
            TeamA: { 1: { 0: 60, 1: 20 } },
            TeamB: { 1: { 0: 30, 1: 0 } },
            TeamC: { 1: { 0: 51, 1: 0 } },
            TeamD: { 1: { 0: 50, 1: 0 } }
        }
    };
    const allPlayerIds = {
        main: {
            TeamA: { 1: { 0: 'p1', 1: 'p3' } },
            TeamB: { 1: { 0: 'p3', 1: null } },
            TeamC: { 1: { 0: 'p2', 1: null } },
            TeamD: { 1: { 0: 'p3', 1: null } }
        }
    };

    const recap = await automator.buildWeeklyRecap(1, brownBellMatchups, brownBellBonuses, allScores, allPlayerIds);

    allPassed &= check('matchups array has both matchups', recap.matchups.length === 2);
    allPassed &= check('biggestBlowout correctly identifies TeamA vs TeamB (50pt margin)', recap.biggestBlowout.margin === 50 && recap.biggestBlowout.winner === 'TeamA');
    allPassed &= check('matchupOfTheWeek correctly identifies the closest gap (TeamC vs TeamD, 1pt)', recap.matchupOfTheWeek.margin === 1 && recap.matchupOfTheWeek.winner === 'TeamC');
    allPassed &= check('topScorer correctly finds Josh Allen at 60 points (highest single-slot score)', recap.topScorer.playerName === 'Josh Allen' && recap.topScorer.points === 60 && recap.topScorer.teamName === 'TeamA');
    allPassed &= check('week 1 has no prior-week data, so biggestUpset is null (not a false positive)', recap.biggestUpset === null);
    allPassed &= check('no prediction votes recorded, so leaguePredictions is null, not an empty/misleading object', recap.leaguePredictions === null);
    allPassed &= check('standingsTop3 has all teams ranked (only 4 exist, so top 3 of 4)', recap.standingsTop3.length === 3 && recap.standingsTop3[0].teamName === 'TeamA');

    // Now test league prediction accuracy with actual votes recorded.
    // 3 votes for TeamA, 1 vote for TeamB in the TeamA/TeamB matchup -
    // majority correctly picked the actual winner (TeamA).
    // 1 vote for TeamC, 2 votes for TeamD in the TeamC/TeamD matchup -
    // majority incorrectly picked TeamD, but TeamC actually won.
    supabase._store.matchup_predictions = [
        { week: 1, team_a_id: 't-a', team_b_id: 't-b', predicted_winner_team_id: 't-a' },
        { week: 1, team_a_id: 't-a', team_b_id: 't-b', predicted_winner_team_id: 't-a' },
        { week: 1, team_a_id: 't-a', team_b_id: 't-b', predicted_winner_team_id: 't-a' },
        { week: 1, team_a_id: 't-a', team_b_id: 't-b', predicted_winner_team_id: 't-b' },
        { week: 1, team_a_id: 't-c', team_b_id: 't-d', predicted_winner_team_id: 't-d' },
        { week: 1, team_a_id: 't-c', team_b_id: 't-d', predicted_winner_team_id: 't-d' },
        { week: 1, team_a_id: 't-c', team_b_id: 't-d', predicted_winner_team_id: 't-c' }
    ];

    const recapWithVotes = await automator.buildWeeklyRecap(1, brownBellMatchups, brownBellBonuses, allScores, allPlayerIds);
    allPassed &= check('league prediction record is 1 correct, 1 wrong', recapWithVotes.leaguePredictions.record.correct === 1 && recapWithVotes.leaguePredictions.record.wrong === 1);
    const abMatchup = recapWithVotes.leaguePredictions.matchups.find(m => m.teamA === 'TeamA');
    allPassed &= check('TeamA/TeamB matchup shows league correctly favored TeamA at 75%', Math.abs(abMatchup.percentA - 75) < 0.01 && abMatchup.leagueCorrect === true);
    const cdMatchup = recapWithVotes.leaguePredictions.matchups.find(m => m.teamA === 'TeamC');
    allPassed &= check('TeamC/TeamD matchup shows league incorrectly favored TeamD, marked leagueCorrect: false', cdMatchup.leagueCorrect === false);

    // Generate-once behavior: saving twice should not overwrite.
    await automator.dataLayer.saveWeeklyRecapIfNotExists(1, { week: 1, marker: 'first' });
    await automator.dataLayer.saveWeeklyRecapIfNotExists(1, { week: 1, marker: 'second-should-be-ignored' });
    const savedRow = supabase._store.weekly_recaps.find(r => r.week === 1);
    allPassed &= check('saveWeeklyRecapIfNotExists never overwrites an existing week', savedRow.content.marker === 'first');
    allPassed &= check('only one row exists for week 1 despite two save attempts', supabase._store.weekly_recaps.filter(r => r.week === 1).length === 1);

    // Week 2 scenario: now prior-week (week 1) history exists, so the
    // upset detector has something real to compute against. TeamB has
    // been consistently weak (30, 25) while TeamA has been consistently
    // strong (80, 85) - if TeamB somehow wins week 2 anyway, that should
    // register as a clear, low-probability upset.
    const allScoresWeek2 = {
        main: {
            TeamA: { 1: { 0: 60, 1: 20 }, 2: { 0: 50, 1: 15 } },   // week1: 80, week2: 65
            TeamB: { 1: { 0: 30, 1: 0 }, 2: { 0: 70, 1: 5 } },     // week1: 30, week2: 75 (upset win)
            TeamC: { 1: { 0: 51, 1: 0 }, 2: { 0: 40, 1: 0 } },
            TeamD: { 1: { 0: 50, 1: 0 }, 2: { 0: 30, 1: 0 } }
        }
    };
    const brownBellBonusesWeek2 = {
        TeamA: { opponent: 'TeamB', teamScore: 65, opponentScore: 75, outcome: 'loss', tier: null, bonusPoints: 0 },
        TeamB: { opponent: 'TeamA', teamScore: 75, opponentScore: 65, outcome: 'win', tier: 1, bonusPoints: 15 },
        TeamC: { opponent: 'TeamD', teamScore: 40, opponentScore: 30, outcome: 'win', tier: 2, bonusPoints: 9 },
        TeamD: { opponent: 'TeamC', teamScore: 30, opponentScore: 40, outcome: 'loss', tier: null, bonusPoints: 0 }
    };

    const recapWeek2 = await automator.buildWeeklyRecap(2, brownBellMatchups, brownBellBonusesWeek2, allScoresWeek2, allPlayerIds);
    allPassed &= check('week 2 upset is correctly detected (TeamB, the historically weaker team, is the winner)', recapWeek2.biggestUpset !== null && recapWeek2.biggestUpset.winner === 'TeamB');
    allPassed &= check('the detected upset has a genuinely low win probability (consistently weaker team pulling the win)', recapWeek2.biggestUpset && recapWeek2.biggestUpset.winnerProbability < 0.5);

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
