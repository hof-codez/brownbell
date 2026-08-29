// test-kickoff-timing-eligibility.js
// Verifies getMinutesUntilKickoff and isEligibleForSub.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

async function run() {
    let allPassed = true;
    const automator = new BrownBellAutomator('test-league');

    automator.playersData = {
        'p-future': { team: 'DAL' },
        'p-soon': { team: 'KC' },
        'p-started': { team: 'BUF' },
        'p-bye': { team: 'MIA' },
        'p-unresolvable': { team: null }
    };

    const now = new Date();
    automator.cachedSchedule = {
        1: {
            DAL: { date: new Date(now.getTime() + 30 * 60000) },
            KC: { date: new Date(now.getTime() + 10 * 60000) },
            BUF: { date: new Date(now.getTime() - 5 * 60000) },
            MIA: { date: null }
        }
    };
    automator.playersData['p-unknown-team'] = { team: 'NYJ' };
    automator.fetchNFLSchedule = async () => automator.cachedSchedule[1];

    const futureMinutes = await automator.getMinutesUntilKickoff('p-future', 1);
    allPassed &= check('30 min out returns a positive number close to 30', futureMinutes > 29 && futureMinutes < 31);

    const startedMinutes = await automator.getMinutesUntilKickoff('p-started', 1);
    allPassed &= check('Already started (5 min ago) returns a NEGATIVE number', startedMinutes < 0);

    const byeResult = await automator.getMinutesUntilKickoff('p-bye', 1);
    allPassed &= check('Confirmed bye returns the sentinel "bye", not a number', byeResult === 'bye');

    const unknownResult = await automator.getMinutesUntilKickoff('p-unknown-team', 1);
    allPassed &= check('Team missing from schedule data returns null (genuinely unknown)', unknownResult === null);

    const unresolvableResult = await automator.getMinutesUntilKickoff('p-unresolvable', 1);
    allPassed &= check('Player with no team at all returns null', unresolvableResult === null);

    allPassed &= check('30 min out is ELIGIBLE with a 15-min buffer', await automator.isEligibleForSub('p-future', 1, 15) === true);
    allPassed &= check('10 min out is NOT eligible with a 15-min buffer (inside the safety window)', await automator.isEligibleForSub('p-soon', 1, 15) === false);
    allPassed &= check('Already started is NOT eligible under any buffer', await automator.isEligibleForSub('p-started', 1, 15) === false);
    allPassed &= check('Confirmed bye IS eligible (not excluded by this rule specifically)', await automator.isEligibleForSub('p-bye', 1, 15) === true);
    allPassed &= check('Genuinely unknown schedule data is CONSERVATIVELY ineligible', await automator.isEligibleForSub('p-unknown-team', 1, 15) === false);

    allPassed &= check('10 min out IS eligible with the tighter 1-min buffer (owner still has time)', await automator.isEligibleForSub('p-soon', 1, 1) === true);

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
