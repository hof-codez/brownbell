// test-auto-sub-excludes-injured-candidates.js
// Proves selectAutoReplacement() never picks a candidate who is themselves
// injured (out/doubtful/ir/pup) as a replacement - confirming a concern
// raised directly: an auto-filled replacement shouldn't turn out to be
// hurt too, defeating the point of the substitution. Covers both a
// mixed-health roster (must pick the healthy one, not just the
// highest-scoring one) and an all-injured roster (must return null rather
// than settle for a hurt candidate).

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.NFL_SEASON_YEAR = '2026';

const { createClient } = require('@supabase/supabase-js');
const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
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
            // p-out-high is the highest-scoring option on the bench, but is
            // themselves OUT - must never be picked despite the higher score.
            players: ['p-out-high', 'p-healthy-low', 'p-doubtful']
        }],
        userMap: { oa: 'TeamA' }
    };
    automator.playersData = {
        'p-out-high': { first_name: 'Injured', last_name: 'HighScorer', position: 'RB', team: 'DAL', injury_status: 'Out', years_exp: 5 },
        'p-healthy-low': { first_name: 'Healthy', last_name: 'LowScorer', position: 'RB', team: 'DAL', injury_status: null, years_exp: 5 },
        'p-doubtful': { first_name: 'Also', last_name: 'Doubtful', position: 'RB', team: 'DAL', injury_status: 'Doubtful', years_exp: 5 }
    };
    automator.isPlayerOnBye = async () => false;
    automator.hasPlayerGameStarted = async () => false;
    // The injured candidate would score highest if scoring were the only
    // factor - the point of this test is confirming health is checked
    // BEFORE scoring ever gets a say.
    automator.getWeeklyScores = async () => ({ 'p-out-high': 25, 'p-healthy-low': 4 });

    const replacement = await automator.selectAutoReplacement('TeamA', 'main', 3, [], null);
    allPassed &= check('Picks the healthy candidate, not the higher-scoring injured one', replacement?.id === 'p-healthy-low');
    allPassed &= check('Never picks the OUT candidate despite the higher score', replacement?.id !== 'p-out-high');
    allPassed &= check('Never picks the DOUBTFUL candidate either', replacement?.id !== 'p-doubtful');

    // --- Edge case: every candidate on the roster is injured ---
    automator.leagueData.rosters[0].players = ['p-out-high', 'p-doubtful'];
    const noneAvailable = await automator.selectAutoReplacement('TeamA', 'main', 3, [], null);
    allPassed &= check('Returns null (no replacement) rather than settling for an injured candidate when everyone available is hurt', noneAvailable === null);

    // --- Same protection for Season of Boom specifically - the one award
    //     where auto-sub actually fires automatically without any owner
    //     action, making this the highest-stakes case for it. ---
    automator.leagueData.rosters[0].players = ['idp-out', 'idp-healthy'];
    automator.playersData['idp-out'] = { first_name: 'Hurt', last_name: 'Linebacker', position: 'LB', team: 'DAL', injury_status: 'IR', years_exp: 5 };
    automator.playersData['idp-healthy'] = { first_name: 'Fine', last_name: 'Linebacker', position: 'LB', team: 'DAL', injury_status: null, years_exp: 5 };
    automator.getWeeklyScores = async () => ({ 'idp-out': 20, 'idp-healthy': 3 });
    automator.isEligibleForSub = async () => true;
    const boomReplacement = await automator.selectAutoReplacement('TeamA', 'boom', 3, [], null, 15);
    allPassed &= check('Season of Boom: picks the healthy IDP, not the higher-scoring IR one', boomReplacement?.id === 'idp-healthy');

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
