// test-replacement-kickoff-timing-rule.js
// Proves the league rule: a replacement's own game must kick off at the
// SAME TIME OR LATER than the starter they're replacing's game - not
// earlier. Without this, an owner could effectively swap in a player from
// an earlier game slot and already know their outcome before the original
// starter's own game even gets underway, which defeats the point of
// locking picks to kickoff at all.
//
// Distinct from the existing "has this candidate's own game already
// started" check: a candidate whose game hasn't started yet but is
// scheduled EARLIER than the original's game must still be excluded.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.NFL_SEASON_YEAR = '2026';

const { createClient } = require('@supabase/supabase-js');
const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

function minutesFromNow(n) {
    return new Date(Date.now() + n * 60000);
}

async function run() {
    let allPassed = true;
    const supabase = createClient();

    await supabase.from('seasons').insert({ id: 's1', year: 2026, current_week: 3 });
    await supabase.from('teams').insert({ id: 't1', season_id: 's1', display_name: 'TeamA', main_permanent_swap_used: false, nextup_permanent_swap_used: false, boom_permanent_swap_used: false });

    const automator = new BrownBellAutomator('test-league');
    await automator.dataLayer.loadSeason(2026, 'test-league');

    automator.leagueData = {
        rosters: [{
            owner_id: 'oa', roster_id: 1,
            players: ['p-earlier', 'p-same-time', 'p-later']
        }],
        userMap: { oa: 'TeamA' }
    };
    automator.playersData = {
        'p-original': { first_name: 'Original', last_name: 'Starter', position: 'RB', team: 'LATE', injury_status: null, years_exp: 5 },
        'p-earlier': { first_name: 'Earlier', last_name: 'Kickoff', position: 'RB', team: 'EARLY', injury_status: null, years_exp: 5 },
        'p-same-time': { first_name: 'SameTime', last_name: 'Kickoff', position: 'RB', team: 'LATE', injury_status: null, years_exp: 3 },
        'p-later': { first_name: 'Later', last_name: 'Kickoff', position: 'RB', team: 'LATER', injury_status: null, years_exp: 2 }
    };
    automator.isPlayerOnBye = async () => false;
    automator.hasPlayerGameStarted = async () => false;
    automator.getWeeklyScores = async () => ({
        'p-earlier': 30,
        'p-same-time': 5,
        'p-later': 4
    });

    const referenceKickoff = minutesFromNow(60);
    automator.cachedSchedule = {
        3: {
            LATE: { date: referenceKickoff },
            EARLY: { date: minutesFromNow(30) },
            LATER: { date: minutesFromNow(90) }
        }
    };

    const replacement = await automator.selectAutoReplacement('TeamA', 'main', 3, [], null, 0, 'p-original');
    allPassed &= check('Never picks the earlier-kickoff candidate despite by far the highest score', replacement?.id !== 'p-earlier');
    allPassed &= check('Picks a same-time-or-later candidate instead', replacement?.id === 'p-same-time' || replacement?.id === 'p-later');

    automator.leagueData.rosters[0].players = ['p-earlier'];
    const noneAvailable = await automator.selectAutoReplacement('TeamA', 'main', 3, [], null, 0, 'p-original');
    allPassed &= check('Returns null rather than falling back to the earlier-kickoff candidate when it\'s the only option', noneAvailable === null);

    automator.leagueData.rosters[0].players = ['p-same-time'];
    const sameTimeResult = await automator.selectAutoReplacement('TeamA', 'main', 3, [], null, 0, 'p-original');
    allPassed &= check('A candidate at the EXACT same kickoff time as the original is allowed, not excluded', sameTimeResult?.id === 'p-same-time');

    automator.playersData['p-original-unknown'] = { first_name: 'Unknown', last_name: 'Team', position: 'RB', team: 'ZZZZ', injury_status: null, years_exp: 5 };
    automator.leagueData.rosters[0].players = ['p-earlier'];
    const unknownOriginalResult = await automator.selectAutoReplacement('TeamA', 'main', 3, [], null, 0, 'p-original-unknown');
    allPassed &= check('When the original\'s own kickoff is unknown, the timing check is skipped rather than excluding everyone', unknownOriginalResult?.id === 'p-earlier');

    // --- Test 5: original and candidate are on the SAME NFL team, sharing
    //     the literal same kickoff - must never be excluded. Regression
    //     test for a real bug: comparing "minutes until kickoff" recomputed
    //     separately for each player (rather than the raw fixed date) can
    //     flip the comparison due to a few milliseconds passing between
    //     the two calls, even though the kickoff is identical. ---
    automator.playersData['p-same-team-candidate'] = { first_name: 'SameTeam', last_name: 'Candidate', position: 'RB', team: 'LATE', injury_status: null, years_exp: 4 };
    automator.leagueData.rosters[0].players = ['p-same-team-candidate'];
    let sameTeamFailures = 0;
    for (let i = 0; i < 25; i++) {
        const result = await automator.selectAutoReplacement('TeamA', 'main', 3, [], null, 0, 'p-original');
        if (result?.id !== 'p-same-team-candidate') sameTeamFailures++;
    }
    allPassed &= check('A candidate on the SAME NFL team as the original (identical kickoff) is never excluded, across 25 repeated calls', sameTeamFailures === 0);

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
