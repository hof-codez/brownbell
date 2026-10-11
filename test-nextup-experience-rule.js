// test-nextup-experience-rule.js
// Verifies the 2026 Next Up rule: a valid duo needs exactly one true rookie (0 yrs)
// paired with exactly one player who has 1-3 yrs experience. No network needed.

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fake';

const BrownBellAutomator = require('./update-standings.js');

function check(label, actual, expected) {
    const pass = actual === expected;
    console.log(`${pass ? '✅' : '❌'} ${label}: got '${actual}', expected '${expected}'`);
    return pass;
}

async function run() {
    const automator = new BrownBellAutomator('test-league');
    let allPassed = true;

    // classifyNextUpExperience: the core rule
    allPassed &= check('0 years', automator.classifyNextUpExperience(0), 'rookie');
    allPassed &= check('1 year', automator.classifyNextUpExperience(1), 'junior');
    allPassed &= check('2 years', automator.classifyNextUpExperience(2), 'junior');
    allPassed &= check('3 years', automator.classifyNextUpExperience(3), 'junior');
    allPassed &= check('4 years', automator.classifyNextUpExperience(4), 'ineligible');
    allPassed &= check('10 years', automator.classifyNextUpExperience(10), 'ineligible');
    allPassed &= check('undefined/null', automator.classifyNextUpExperience(undefined), 'rookie'); // (yearsExp || 0) - matches years_exp missing = treated as 0

    // getPlayerExperienceForWeek end-to-end: rookie + junior should be resolvable and valid;
    // rookie + rookie should be resolvable and INVALID per the new rule.
    automator.playersData = {
        'rookie1': { years_exp: 0 },
        'junior1': { years_exp: 2 },
        'rookie2': { years_exp: 0 },
        'vet1': { years_exp: 5 }
    };
    automator.leagueData = { rosters: [], userMap: {} };
    automator.knownDuos.nextup = {
        ValidTeam: [{ name: 'A', position: 'WR', sleeperId: 'rookie1' }, { name: 'B', position: 'RB', sleeperId: 'junior1' }],
        TwoRookiesTeam: [{ name: 'C', position: 'WR', sleeperId: 'rookie1' }, { name: 'D', position: 'RB', sleeperId: 'rookie2' }],
        VetTeam: [{ name: 'E', position: 'WR', sleeperId: 'rookie1' }, { name: 'F', position: 'RB', sleeperId: 'vet1' }]
    };

    const validP1 = automator.getPlayerExperienceForWeek('ValidTeam', 0, 3, []);
    const validP2 = automator.getPlayerExperienceForWeek('ValidTeam', 1, 3, []);
    allPassed &= check('ValidTeam slot 0', validP1, 'rookie');
    allPassed &= check('ValidTeam slot 1', validP2, 'junior');

    const tworP1 = automator.getPlayerExperienceForWeek('TwoRookiesTeam', 0, 3, []);
    const tworP2 = automator.getPlayerExperienceForWeek('TwoRookiesTeam', 1, 3, []);
    allPassed &= check('TwoRookiesTeam slot 0', tworP1, 'rookie');
    allPassed &= check('TwoRookiesTeam slot 1', tworP2, 'rookie'); // both rookie -> should be flagged invalid by the caller

    const vetP2 = automator.getPlayerExperienceForWeek('VetTeam', 1, 3, []);
    allPassed &= check('VetTeam slot 1 (5 yrs)', vetP2, 'ineligible');

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
