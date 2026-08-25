// test-nextup-experience-rule.js
// Verifies the Next Up rule: a player entering their 1st, 2nd, or 3rd season
// (years_exp 0, 1, or 2) is individually eligible - a player entering their
// 4th season (years_exp 3, e.g. Jordan Addison in 2026) is NOT. A valid PAIR
// must differ in both years of experience AND position. No network needed.

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fake';

const BrownBellAutomator = require('./update-standings.js');

function check(label, actual, expected) {
    const pass = actual === expected;
    console.log(`${pass ? '✅' : '❌'} ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    return pass;
}

async function run() {
    const automator = new BrownBellAutomator('test-league');
    let allPassed = true;

    // Individual eligibility - entering season 1/2/3 (years_exp 0/1/2) eligible,
    // entering season 4 (years_exp 3) is the real-world Jordan Addison case and
    // must NOT be eligible.
    allPassed &= check('0 yrs (entering season 1) eligible', automator.isNextUpEligibleExperience(0), true);
    allPassed &= check('1 yr (entering season 2) eligible', automator.isNextUpEligibleExperience(1), true);
    allPassed &= check('2 yrs (entering season 3) eligible', automator.isNextUpEligibleExperience(2), true);
    allPassed &= check('3 yrs (entering season 4 - Jordan Addison) NOT eligible', automator.isNextUpEligibleExperience(3), false);
    allPassed &= check('4 yrs ineligible', automator.isNextUpEligibleExperience(4), false);
    allPassed &= check('10 yrs ineligible', automator.isNextUpEligibleExperience(10), false);

    // Pair validity - the core of the rule
    const rookieWR = { years: 0, position: 'WR' };
    const secondYearRB = { years: 1, position: 'RB' };
    const thirdSeasonQB = { years: 2, position: 'QB' }; // entering season 3 - still eligible
    const fourthSeasonQB = { years: 3, position: 'QB' }; // entering season 4 - Jordan Addison case, NOT eligible
    const anotherRookieWR = { years: 0, position: 'WR' }; // same years AND same position as rookieWR
    const rookieRB = { years: 0, position: 'RB' }; // same years as rookieWR, different position
    const secondYearWR = { years: 1, position: 'WR' }; // different years, same position as rookieWR
    const vetRB = { years: 5, position: 'RB' }; // ineligible

    allPassed &= check('rookie WR + 2nd-year RB (differ both)', automator.isValidNextUpCombo(rookieWR, secondYearRB), true);
    allPassed &= check('rookie WR + 3rd-season QB (differ both, still eligible)', automator.isValidNextUpCombo(rookieWR, thirdSeasonQB), true);
    allPassed &= check('2nd-year RB + 3rd-season QB (differ both, still eligible)', automator.isValidNextUpCombo(secondYearRB, thirdSeasonQB), true);

    allPassed &= check('rookie WR + rookie WR (same years, same pos)', automator.isValidNextUpCombo(rookieWR, anotherRookieWR), false);
    allPassed &= check('rookie WR + rookie RB (same years, diff pos)', automator.isValidNextUpCombo(rookieWR, rookieRB), false);
    allPassed &= check('rookie WR + 2nd-year WR (diff years, same pos)', automator.isValidNextUpCombo(rookieWR, secondYearWR), false);
    allPassed &= check('rookie WR + vet RB (one ineligible)', automator.isValidNextUpCombo(rookieWR, vetRB), false);
    allPassed &= check('rookie WR + 4th-season QB (Jordan Addison case - ineligible even paired with an eligible rookie)', automator.isValidNextUpCombo(rookieWR, fourthSeasonQB), false);

    allPassed &= check('null + anything -> null (unresolved, not flagged)', automator.isValidNextUpCombo(null, rookieWR), null);

    // getPlayerExperienceForWeek end-to-end
    automator.playersData = {
        'rookie1': { years_exp: 0, position: 'WR' },
        'second1': { years_exp: 1, position: 'RB' }
    };
    automator.leagueData = { rosters: [], userMap: {} };
    automator.knownDuos.nextup = {
        ValidTeam: [{ name: 'A', position: 'WR', sleeperId: 'rookie1' }, { name: 'B', position: 'RB', sleeperId: 'second1' }]
    };

    const validCombo = automator.isValidNextUpCombo(
        automator.getPlayerExperienceForWeek('ValidTeam', 0, 3, []),
        automator.getPlayerExperienceForWeek('ValidTeam', 1, 3, [])
    );
    allPassed &= check('ValidTeam (rookie WR + 2nd-year RB) end-to-end', validCombo, true);

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    return allPassed;
}

async function testExperienceResolutionFix() {
    console.log('\n--- getPlayerExperienceForWeek current-week fast path ---');
    const automator = new BrownBellAutomator('test-league');
    let allPassed = true;

    // duos says Player B (a rookie WR) is CURRENTLY in nextup slot 0.
    automator.knownDuos = {
        nextup: { TeamA: [{ name: 'Player B', position: 'WR', sleeperId: 'p-b' }, null] },
        main: {}
    };
    automator.playersData = {
        'p-a': { years_exp: 5, position: 'QB' }, // stale substitute - should be ignored for current week
        'p-b': { years_exp: 0, position: 'WR' }  // real current pick
    };
    automator.leagueData = { rosters: [], userMap: {} };

    const adversarialSubstitutions = [
        { teamName: 'TeamA', playerIndex: 0, awardType: 'nextup', startWeek: 1, endWeek: null, substitutePlayerId: 'p-a', substituteName: 'Player A' },
        { teamName: 'TeamA', playerIndex: 0, awardType: 'nextup', startWeek: 2, endWeek: null, substitutePlayerId: 'p-b', substituteName: 'Player B' }
    ];

    const currentWeekResult = automator.getPlayerExperienceForWeek('TeamA', 0, 3, adversarialSubstitutions, 3);
    allPassed &= check(
        'Current week correctly resolves to Player B (years=0) from live duos, ignoring the adversarial stale substitution',
        currentWeekResult ? `${currentWeekResult.years}/${currentWeekResult.position}` : null,
        '0/WR'
    );

    const pastWeekResult = automator.getPlayerExperienceForWeek('TeamA', 0, 1, adversarialSubstitutions, 3);
    allPassed &= check(
        'Past week (not current) still uses substitutions-based reconstruction as before',
        pastWeekResult ? `${pastWeekResult.years}/${pastWeekResult.position}` : null,
        '5/QB'
    );

    console.log(allPassed ? '✅ ALL CHECKS PASSED' : '❌ SOME CHECKS FAILED');
    return allPassed;
}

async function main() {
    const result1 = await run();
    const result2 = await testExperienceResolutionFix();
    process.exit((result1 && result2) ? 0 : 1);
}

main().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
