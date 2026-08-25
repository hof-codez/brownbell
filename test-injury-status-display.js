// test-injury-status-display.js
// Verifies: processDuoSlots captures and writes injury_status for EVERY
// currently-set duo slot with a resolved player, regardless of whether that
// slot is locked yet - this is a pure display field for the Teams tab's
// injury dots, separate from the lock/substitution logic.

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

    await supabase.from('seasons').insert({ id: seasonId, year: 2026, current_week: 3 });
    await supabase.from('teams').insert({ id: teamId, season_id: seasonId, display_name: 'TeamA', permanent_swaps_used: 0, manual_privilege: true });
    await supabase.from('duos').insert([
        { id: 'd1', team_id: teamId, award_type: 'main', player_index: 0, player_name: 'Locked QB', player_position: 'QB', sleeper_player_id: 'p-locked-questionable', source: 'import' },
        { id: 'd2', team_id: teamId, award_type: 'main', player_index: 1, player_name: 'Locked RB', player_position: 'RB', sleeper_player_id: 'p-locked-healthy', source: 'import' },
        { id: 'd3', team_id: teamId, award_type: 'nextup', player_index: 0, player_name: 'Prelock WR', player_position: 'WR', sleeper_player_id: 'p-prelock-out', source: 'import' }
    ]);

    const automator = new BrownBellAutomator('test-league');
    automator.playersData = {
        'p-locked-questionable': { first_name: 'Locked', last_name: 'QB', position: 'QB', team: 'DAL', injury_status: 'Questionable', years_exp: 5 },
        'p-locked-healthy': { first_name: 'Locked', last_name: 'RB', position: 'RB', team: 'DAL', injury_status: null, years_exp: 5 },
        'p-prelock-out': { first_name: 'Prelock', last_name: 'WR', position: 'WR', team: 'DAL', injury_status: 'Out', years_exp: 1 }
    };
    automator.leagueData = {
        rosters: [{ owner_id: 'oa', roster_id: 1, players: ['p-locked-questionable', 'p-locked-healthy', 'p-prelock-out'] }],
        userMap: { oa: 'TeamA' }
    };
    automator.hasPlayerGameStarted = async (playerId, week) =>
        week === 1 && (playerId === 'p-locked-questionable' || playerId === 'p-locked-healthy');
    automator.isPlayerOnBye = async () => false;
    automator.getWeeklyScores = async () => ({});

    await automator.dataLayer.loadSeason(2026, 'test-league');
    await automator.processDuoSlots(3);

    const rowById = id => supabase._store.duos.find(d => d.id === id);

    allPassed &= check('Locked+questionable player: injury_status written as "Questionable"', rowById('d1').injury_status === 'Questionable');
    allPassed &= check('Locked+healthy player: injury_status written as null', rowById('d2').injury_status === null);
    allPassed &= check('PRE-LOCK player still gets injury_status captured ("Out"), not skipped', rowById('d3').injury_status === 'Out');

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
