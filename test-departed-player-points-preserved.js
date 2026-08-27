// test-departed-player-points-preserved.js
// Verifies: if a player is hurt, traded, or released mid-season and gets
// replaced, the points they earned BEFORE that happened stay permanently
// credited to the owner's season total. The season total should be the sum
// of whoever actually earned points in that slot each week: the departed
// player's early weeks PLUS the replacement's later weeks, never just one
// or the other.

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

    // TeamA's Main Award slot 0: Player X for weeks 1-2, then Player Y
    // (auto-filled after X was traded/injured) from week 3 onward.
    automator.knownDuos = {
        main: { TeamA: [{ name: 'Player Y', position: 'RB', sleeperId: 'p-y' }, { name: 'Player Z', position: 'WR', sleeperId: 'p-z' }] },
        nextup: {}
    };
    automator.playersData = {
        'p-x': { first_name: 'Player', last_name: 'X', position: 'RB', team: 'DAL', injury_status: null, years_exp: 4 },
        'p-y': { first_name: 'Player', last_name: 'Y', position: 'RB', team: 'DAL', injury_status: null, years_exp: 2 },
        'p-z': { first_name: 'Player', last_name: 'Z', position: 'WR', team: 'DAL', injury_status: null, years_exp: 3 }
    };
    automator.leagueData = { rosters: [{ owner_id: 'oa', roster_id: 1, players: ['p-y', 'p-z'] }], userMap: { oa: 'TeamA' } };
    automator.hasPlayerGameStarted = async (id, week) => week === 1;
    automator.isPlayerOnBye = async () => false;
    automator.getCurrentWeek = async () => 4;

    const scoresByWeek = {
        1: { 'p-x': 20, 'p-z': 5 },
        2: { 'p-x': 15, 'p-z': 6 },
        3: { 'p-y': 10, 'p-z': 7 },
        4: { 'p-y': 12, 'p-z': 8 }
    };
    automator.getWeeklyScores = async (week) => scoresByWeek[week] || {};

    const existingSubstitutions = [
        { teamName: 'TeamA', playerIndex: 0, awardType: 'main', startWeek: 1, endWeek: 2, substitutePlayerId: 'p-x', substituteName: 'Player X', isTemporaryByeReplacement: false },
        { teamName: 'TeamA', playerIndex: 0, awardType: 'main', startWeek: 3, endWeek: null, substitutePlayerId: 'p-y', substituteName: 'Player Y', isTemporaryByeReplacement: false }
    ];

    const { scores } = await automator.updateAllScores(existingSubstitutions, [], { main: {}, nextup: {} });

    const week1 = scores.main['TeamA'][1][0];
    const week2 = scores.main['TeamA'][2][0];
    const week3 = scores.main['TeamA'][3][0];
    const week4 = scores.main['TeamA'][4][0];
    const seasonTotal = week1 + week2 + week3 + week4;

    allPassed &= check('Week 1 correctly credits Player X\'s real score (20), not lost or zeroed', week1 === 20);
    allPassed &= check('Week 2 correctly credits Player X\'s real score (15)', week2 === 15);
    allPassed &= check('Week 3 correctly credits Player Y\'s real score (10), after the swap', week3 === 10);
    allPassed &= check('Week 4 correctly credits Player Y\'s real score (12)', week4 === 12);
    allPassed &= check(
        'Season total is the TRUE sum of everyone who actually played in the slot (20+15+10+12=57) - Player X\'s early points were NOT lost when Player Y took over',
        seasonTotal === 57
    );

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
