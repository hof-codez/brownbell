// test-current-week-scoring-fix.js
// Verifies the actual fix: updateAllScores now resolves the CURRENT week's
// player directly from duos (the live source of truth), not by searching
// substitutions for an "active" entry. This test deliberately constructs
// the adversarial scenario the original bug could produce - TWO conflicting
// "active" (end_week: null) substitution entries for the same slot, one
// stale and one current - and confirms the score still correctly lands on
// whoever duos actually says is playing, completely ignoring the ambiguous
// substitutions data for the current week.

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

    const seasonId = 's1';
    const teamId = 'team-a';

    await supabase.from('seasons').insert({ id: seasonId, year: 2026, current_week: 3, sleeper_league_id: 'test-league' });
    await supabase.from('teams').insert({ id: teamId, season_id: seasonId, display_name: 'TeamA', permanent_swaps_used: 0, manual_privilege: true });

    await supabase.from('duos').insert([
        { id: 'd1', team_id: teamId, award_type: 'main', player_index: 0, player_name: 'Player B', player_position: 'QB', sleeper_player_id: 'p-b' },
        { id: 'd2', team_id: teamId, award_type: 'main', player_index: 1, player_name: 'Player Two', player_position: 'RB', sleeper_player_id: 'p2' }
    ]);

    const automator = new BrownBellAutomator('test-league');
    automator.playersData = {
        'p-a': { first_name: 'Player', last_name: 'A', position: 'QB', team: 'DAL', injury_status: null, years_exp: 5 },
        'p-b': { first_name: 'Player', last_name: 'B', position: 'QB', team: 'DAL', injury_status: null, years_exp: 5 },
        'p2': { first_name: 'Player', last_name: 'Two', position: 'RB', team: 'DAL', injury_status: null, years_exp: 5 }
    };
    automator.leagueData = {
        rosters: [{ owner_id: 'oa', roster_id: 1, players: ['p-a', 'p-b', 'p2'] }],
        userMap: { oa: 'TeamA' }
    };
    automator.hasPlayerGameStarted = async (id, week) => week === 1;
    automator.isPlayerOnBye = async () => false;
    automator.getWeeklyScores = async () => ({ 'p-a': 999, 'p-b': 42 });
    automator.getCurrentWeek = async () => 3;

    await automator.dataLayer.loadSeason(2026, 'test-league');
    await automator.loadKnownDuos();

    const adversarialSubstitutions = [
        { teamName: 'TeamA', playerIndex: 0, awardType: 'main', startWeek: 1, endWeek: null, substitutePlayerId: 'p-a', substituteName: 'Player A', isTemporaryByeReplacement: false },
        { teamName: 'TeamA', playerIndex: 0, awardType: 'main', startWeek: 2, endWeek: null, substitutePlayerId: 'p-b', substituteName: 'Player B', isTemporaryByeReplacement: false }
    ];

    const { scores } = await automator.updateAllScores(adversarialSubstitutions, [], { main: {}, nextup: {} });

    const currentWeekScore = scores.main['TeamA'][3][0];

    allPassed &= check(
        'Current week score correctly reflects Player B (42) - the real duos pick - NOT Player A (999), despite the adversarial stale substitution entry',
        currentWeekScore === 42
    );

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
