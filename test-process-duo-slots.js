// test-process-duo-slots.js
// End-to-end offline test of processDuoSlots() - the core engine replacing
// the old substitutions-layered model. Covers: healthy-locked (no action),
// temporary injury (auto-fill, unlimited), auto-revert (original healthy
// again), and the permanent-swap budget (1st = clear for owner, 2nd =
// auto-fill + revoke privilege).

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
    const supabase = createClient();
    let allPassed = true;

    const seasonId = 's1';
    const teamAId = 'team-a'; // healthy-locked case
    const teamBId = 'team-b'; // temporary injury + auto-revert case
    const teamCId = 'team-c'; // 1st permanent departure case
    const teamDId = 'team-d'; // 2nd permanent departure case

    await supabase.from('seasons').insert({ id: seasonId, year: 2026, current_week: 3 });
    await supabase.from('teams').insert([
        { id: teamAId, season_id: seasonId, display_name: 'TeamA', permanent_swaps_used: 0, manual_privilege: true },
        { id: teamBId, season_id: seasonId, display_name: 'TeamB', permanent_swaps_used: 0, manual_privilege: true },
        { id: teamCId, season_id: seasonId, display_name: 'TeamC', permanent_swaps_used: 0, manual_privilege: true },
        { id: teamDId, season_id: seasonId, display_name: 'TeamD', permanent_swaps_used: 1, manual_privilege: true }
    ]);

    await supabase.from('duos').insert([
        // TeamA: healthy, locked - should be untouched
        { id: 'da1', team_id: teamAId, award_type: 'main', player_index: 0, player_name: 'Healthy QB', player_position: 'QB', sleeper_player_id: 'p-healthy', source: 'import' },
        { id: 'da2', team_id: teamAId, award_type: 'main', player_index: 1, player_name: 'Healthy RB', player_position: 'RB', sleeper_player_id: 'p-healthy-rb', source: 'import' },

        // TeamB: injured, locked - should auto-fill, then revert once healthy
        { id: 'db1', team_id: teamBId, award_type: 'main', player_index: 0, player_name: 'Hurt QB', player_position: 'QB', sleeper_player_id: 'p-hurt', source: 'import' },
        { id: 'db2', team_id: teamBId, award_type: 'main', player_index: 1, player_name: 'B RB', player_position: 'RB', sleeper_player_id: 'p-b-rb', source: 'import' },

        // TeamC: player no longer on roster (permanent, 1st of the season) - should clear
        { id: 'dc1', team_id: teamCId, award_type: 'main', player_index: 0, player_name: 'Gone QB', player_position: 'QB', sleeper_player_id: 'p-gone-c', source: 'import' },
        { id: 'dc2', team_id: teamCId, award_type: 'main', player_index: 1, player_name: 'C RB', player_position: 'RB', sleeper_player_id: 'p-c-rb', source: 'import' },

        // TeamD: player no longer on roster (permanent, 2nd of the season - already used 1) - should auto-fill + revoke privilege
        { id: 'dd1', team_id: teamDId, award_type: 'main', player_index: 0, player_name: 'Gone QB D', player_position: 'QB', sleeper_player_id: 'p-gone-d', source: 'owner' },
        { id: 'dd2', team_id: teamDId, award_type: 'main', player_index: 1, player_name: 'D RB', player_position: 'RB', sleeper_player_id: 'p-d-rb', source: 'import' }
    ]);

    const automator = new BrownBellAutomator('test-league');

    automator.playersData = {
        'p-healthy': { first_name: 'Healthy', last_name: 'QB', position: 'QB', team: 'DAL', injury_status: null, years_exp: 5 },
        'p-healthy-rb': { first_name: 'Healthy', last_name: 'RB', position: 'RB', team: 'DAL', injury_status: null, years_exp: 5 },

        'p-hurt': { first_name: 'Hurt', last_name: 'QB', position: 'QB', team: 'DAL', injury_status: 'Out', years_exp: 5 },
        'p-b-rb': { first_name: 'B', last_name: 'RB', position: 'RB', team: 'DAL', injury_status: null, years_exp: 5 },
        'p-b-cover': { first_name: 'Cover', last_name: 'QB', position: 'QB', team: 'DAL', injury_status: null, years_exp: 3 },

        'p-c-rb': { first_name: 'C', last_name: 'RB', position: 'RB', team: 'DAL', injury_status: null, years_exp: 5 },
        // p-gone-c intentionally NOT in playersData's roster list below (traded away)
        'p-gone-c': { first_name: 'Gone', last_name: 'QB', position: 'QB', team: 'SEA', injury_status: null, years_exp: 5 },

        'p-d-rb': { first_name: 'D', last_name: 'RB', position: 'RB', team: 'DAL', injury_status: null, years_exp: 5 },
        'p-gone-d': { first_name: 'Gone', last_name: 'QB', position: 'QB', team: 'SEA', injury_status: null, years_exp: 5 },
        'p-d-cover': { first_name: 'Cover', last_name: 'QB', position: 'QB', team: 'DAL', injury_status: null, years_exp: 4 }
    };

    automator.leagueData = {
        rosters: [
            { owner_id: 'oa', roster_id: 1, players: ['p-healthy', 'p-healthy-rb'] },
            { owner_id: 'ob', roster_id: 2, players: ['p-hurt', 'p-b-rb', 'p-b-cover'] },
            { owner_id: 'oc', roster_id: 3, players: ['p-c-rb'] }, // p-gone-c NOT here - traded away
            { owner_id: 'od', roster_id: 4, players: ['p-d-rb', 'p-d-cover'] } // p-gone-d NOT here - traded away
        ],
        userMap: { oa: 'TeamA', ob: 'TeamB', oc: 'TeamC', od: 'TeamD' }
    };

    // hasPlayerGameStarted is used for two different checks: "has this
    // player's Week 1 game happened" (the season-long lock check, should be
    // true for everyone in this test) vs "has this candidate's game already
    // started THIS week" (an exclusion filter when picking replacements,
    // should be false - it's still pregame for the week being evaluated).
    automator.hasPlayerGameStarted = async (playerId, week) => week === 1;
    automator.isPlayerOnBye = async () => false;
    automator.getWeeklyScores = async () => ({ 'p-b-cover': 15, 'p-d-cover': 12 });

    automator.dataLayer.loadSeason ? null : null; // no-op, just documenting intent
    await automator.dataLayer.loadSeason(2026, 'test-league');

    console.log('\n=== RUN 1: initial checkpoint - injuries and permanent departures detected ===');
    const events1 = await automator.processDuoSlots(3);
    console.log(events1.map(e => `${e.type}: ${e.teamName}/${e.awardType}`).join('\n'));

    // --- TeamA: healthy-locked, no action ---
    const teamADuos = supabase._store.duos.filter(d => d.team_id === teamAId);
    allPassed &= check('TeamA (healthy) untouched', teamADuos.find(d => d.id === 'da1').sleeper_player_id === 'p-healthy');

    // --- TeamB: temporary injury, auto-filled, original frozen ---
    const teamBSlot0 = supabase._store.duos.find(d => d.team_id === teamBId && d.player_index === 0);
    allPassed &= check('TeamB slot 0 auto-filled with a real replacement (not the hurt player)', teamBSlot0.sleeper_player_id !== 'p-hurt' && !!teamBSlot0.sleeper_player_id);
    allPassed &= check('TeamB original frozen to the hurt player', teamBSlot0.original_sleeper_player_id === 'p-hurt');
    allPassed &= check('TeamB slot marked source: auto', teamBSlot0.source === 'auto');

    // --- TeamC: 1st permanent departure - slot cleared ---
    const teamCSlot0Exists = supabase._store.duos.some(d => d.team_id === teamCId && d.player_index === 0);
    allPassed &= check('TeamC slot 0 cleared (1st permanent departure - left for owner)', !teamCSlot0Exists);
    const teamCState = supabase._store.teams.find(t => t.id === teamCId);
    allPassed &= check('TeamC swap budget UNCHANGED (clearing does not consume it - only an owner pick does)', teamCState.permanent_swaps_used === 0 && teamCState.manual_privilege === true);

    // --- TeamD: 2nd permanent departure - auto-filled AND privilege revoked ---
    const teamDSlot0 = supabase._store.duos.find(d => d.team_id === teamDId && d.player_index === 0);
    allPassed &= check('TeamD slot 0 auto-filled (2nd permanent departure)', teamDSlot0.sleeper_player_id !== 'p-gone-d' && !!teamDSlot0.sleeper_player_id);
    const teamDState = supabase._store.teams.find(t => t.id === teamDId);
    allPassed &= check('TeamD permanent_swaps_used now 2', teamDState.permanent_swaps_used === 2);
    allPassed &= check('TeamD manual_privilege revoked', teamDState.manual_privilege === false);

    console.log('\n=== RUN 2: hurt player is healthy again - should auto-revert ===');
    automator.playersData['p-hurt'].injury_status = null; // recovered
    const events2 = await automator.processDuoSlots(4);
    console.log(events2.map(e => `${e.type}: ${e.teamName}/${e.awardType}`).join('\n'));

    const teamBSlot0After = supabase._store.duos.find(d => d.team_id === teamBId && d.player_index === 0);
    allPassed &= check('TeamB reverted back to the original (now-healthy) player', teamBSlot0After.sleeper_player_id === 'p-hurt');

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
