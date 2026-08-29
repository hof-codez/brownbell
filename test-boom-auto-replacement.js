// test-boom-auto-replacement.js
// Verifies selectAutoReplacement's new Season of Boom behavior.

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

    const now = new Date();
    automator.playersData = {
        'p-lb': { first_name: 'Line', last_name: 'Backer', position: 'LB', team: 'DAL', injury_status: null, years_exp: 3 },
        'p-db': { first_name: 'Defensive', last_name: 'Back', position: 'DB', team: 'DAL', injury_status: null, years_exp: 2 },
        'p-offense': { first_name: 'Skill', last_name: 'Player', position: 'WR', team: 'DAL', injury_status: null, years_exp: 4 },
        'p-soon': { first_name: 'Soon', last_name: 'Kickoff', position: 'DL', team: 'KC', injury_status: null, years_exp: 1 },
        'p-plenty': { first_name: 'Plenty', last_name: 'OfTime', position: 'DL', team: 'MIA', injury_status: null, years_exp: 1 }
    };
    automator.leagueData = {
        rosters: [{ owner_id: 'oa', roster_id: 1, players: ['p-lb', 'p-db', 'p-offense', 'p-soon', 'p-plenty'] }],
        userMap: { oa: 'TeamA' }
    };
    automator.cachedSchedule = {
        3: {
            DAL: { date: new Date(now.getTime() + 60 * 60000) },
            KC: { date: new Date(now.getTime() + 10 * 60000) },
            MIA: { date: new Date(now.getTime() + 60 * 60000) }
        }
    };
    automator.isPlayerOnBye = async () => false;
    automator.getWeeklyScores = async () => ({ 'p-lb': 15, 'p-db': 12, 'p-offense': 30, 'p-soon': 8, 'p-plenty': 10 });

    const candidate1 = await automator.selectAutoReplacement('TeamA', 'boom', 3, [], null, 0);
    allPassed &= check(
        'Selected candidate is an IDP position, never the offensive skill player even though they score highest',
        candidate1 && ['DL', 'LB', 'DB'].includes(candidate1.position)
    );

    const otherSlotInfo = { position: 'LB', years: 5 };
    const candidate2 = await automator.selectAutoReplacement('TeamA', 'boom', 3, ['p-offense', 'p-soon', 'p-plenty'], otherSlotInfo, 0);
    allPassed &= check('No combo constraint - a same-position pairing is still valid for boom', candidate2 !== null);

    const candidate3 = await automator.selectAutoReplacement('TeamA', 'boom', 3, ['p-lb', 'p-db', 'p-offense'], null, 15);
    allPassed &= check(
        'With a 15-min buffer, the candidate kicking off in 10 min is excluded, leaving only the one with plenty of time',
        candidate3 && candidate3.id === 'p-plenty'
    );

    const candidate4 = await automator.selectAutoReplacement('TeamA', 'boom', 3, ['p-lb', 'p-db', 'p-offense', 'p-plenty'], null, 1);
    allPassed &= check(
        'With only a 1-min buffer, the candidate kicking off in 10 min IS still eligible',
        candidate4 && candidate4.id === 'p-soon'
    );

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
