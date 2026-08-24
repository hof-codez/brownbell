// test-brownbell-bonuses.js
// Exercises the real class methods (not standalone logic copies): round-robin
// schedule generation via getBrownBellMatchupsForWeek, tier/bonus assignment
// via computeBrownBellBonuses, and the actual Supabase write via saveBonusResults.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const { createClient } = require('@supabase/supabase-js');
const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

async function run() {
    const supabase = createClient();
    let allPassed = true;

    const automator = new BrownBellAutomator('test-league');

    // 12 teams, roster_id 1-12, deliberately shuffled owner order to confirm
    // sorting is genuinely by roster_id, not insertion order.
    const teamNames = Array.from({ length: 12 }, (_, i) => `Team${i}`);
    automator.leagueData = {
        rosters: teamNames.map((name, i) => ({ owner_id: `owner${i}`, roster_id: 12 - i })).sort(() => Math.random() - 0.5),
        userMap: Object.fromEntries(teamNames.map((name, i) => [`owner${i}`, name]))
    };

    // --- Test getBrownBellMatchupsForWeek via the real method ---
    const week1 = automator.getBrownBellMatchupsForWeek(1);
    allPassed &= check('Week 1 has exactly 6 matchups', week1.length === 6);
    const allTeamsInWeek1 = new Set(week1.flat());
    allPassed &= check('Week 1 covers all 12 teams exactly once', allTeamsInWeek1.size === 12);

    // Cycling: week 12 should repeat week 1's schedule (11-week cycle for 12 teams)
    const week12 = automator.getBrownBellMatchupsForWeek(12);
    allPassed &= check('Week 12 repeats week 1\'s schedule (cycles after 11 rounds)', JSON.stringify(week1) === JSON.stringify(week12));

    // --- Test computeBrownBellBonuses via the real method ---
    const weekTotals = {};
    teamNames.forEach((name, i) => { weekTotals[name] = (i + 1) * 5; }); // Team0=5, Team1=10, ..., Team11=60

    const bonuses = automator.computeBrownBellBonuses(week1, weekTotals);
    const totalBonusAwarded = Object.values(bonuses).reduce((sum, r) => sum + r.bonusPoints, 0);
    allPassed &= check('Total bonus awarded matches the full tier pool (43) - no ties in this scenario', Math.abs(totalBonusAwarded - 43) < 0.001);

    const highestScorer = teamNames.reduce((best, name) => weekTotals[name] > weekTotals[best] ? name : best);
    allPassed &= check(`Highest overall scorer (${highestScorer}) won their matchup and got a bonus > 0`, bonuses[highestScorer]?.outcome === 'win' && bonuses[highestScorer]?.bonusPoints > 0);

    // Every team should have exactly one result, either win or loss (no ties in this strictly-increasing scenario)
    allPassed &= check('Every team has a result', teamNames.every(name => bonuses[name] !== undefined));
    allPassed &= check('Exactly 6 winners, 6 losers (no ties, strictly distinct scores)', 
        teamNames.filter(n => bonuses[n].outcome === 'win').length === 6 &&
        teamNames.filter(n => bonuses[n].outcome === 'loss').length === 6
    );

    // --- Test saveBonusResults writes correctly to Supabase ---
    await supabase.from('seasons').insert({ id: 's1', year: 2026 });
    await supabase.from('teams').insert(teamNames.map((name, i) => ({ id: `t${i}`, season_id: 's1', display_name: name })));

    const dl = automator.dataLayer;
    await dl.loadSeason(2026, 'test-league');
    await dl.saveBonusResults(3, bonuses);

    const savedRows = supabase._store.bonus_results;
    allPassed &= check('12 rows saved (one per team)', savedRows.length === 12);

    const winnerRow = savedRows.find(r => r.team_id === dl.teamIdByName[highestScorer]);
    allPassed &= check('Saved row for the top scorer shows outcome=win, tier=1, correct bonus', winnerRow.outcome === 'win' && winnerRow.tier === 1 && winnerRow.bonus_points === 15);

    // --- Test the regular-season cutoff ---
    const week14 = automator.getBrownBellMatchupsForWeek(14);
    allPassed &= check('Week 14 (last regular-season week) still produces 6 real matchups', week14.length === 6);

    const week15 = automator.getBrownBellMatchupsForWeek(15);
    allPassed &= check('Week 15 (first playoff week) produces NO matchups - mechanic stops', week15.length === 0);

    const playoffBonuses = automator.computeBrownBellBonuses(week15, weekTotals);
    allPassed &= check('computeBrownBellBonuses on an empty matchup list returns no results (no crash)', Object.keys(playoffBonuses).length === 0);

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
