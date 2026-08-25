// test-no-replacement-visibility.js
// Verifies: when the automation can't find ANY eligible replacement, this is
// no longer silent. Two scenarios: (1) temporary injury with no candidates -
// injured player stays in place, but a no_replacement_available history entry
// is logged. (2) permanent departure with no candidates - the slot is cleared
// (not left pointing at a player no longer on the roster) and logged.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const { createClient } = require('@supabase/supabase-js');
const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

async function run() {
    let allPassed = true;

    // --- Scenario 1: temporary injury, no eligible replacement anywhere ---
    {
        const supabase = createClient();
        const seasonId = 's1';
        const teamId = 'team-a';

        await supabase.from('seasons').insert({ id: seasonId, year: 2026, current_week: 3 });
        await supabase.from('teams').insert({ id: teamId, season_id: seasonId, display_name: 'TeamA', permanent_swaps_used: 0, manual_privilege: true });
        await supabase.from('duos').insert([
            { id: 'd1', team_id: teamId, award_type: 'main', player_index: 0, player_name: 'Hurt QB', player_position: 'QB', sleeper_player_id: 'p-hurt', source: 'import' },
            { id: 'd2', team_id: teamId, award_type: 'main', player_index: 1, player_name: 'Healthy RB', player_position: 'RB', sleeper_player_id: 'p-healthy', source: 'import' }
        ]);

        const automator = new BrownBellAutomator('test-league');
        automator.playersData = {
            'p-hurt': { first_name: 'Hurt', last_name: 'QB', position: 'QB', team: 'DAL', injury_status: 'Out', years_exp: 5 },
            'p-healthy': { first_name: 'Healthy', last_name: 'RB', position: 'RB', team: 'DAL', injury_status: null, years_exp: 5 }
        };
        automator.leagueData = {
            rosters: [{ owner_id: 'oa', roster_id: 1, players: ['p-hurt', 'p-healthy'] }],
            userMap: { oa: 'TeamA' }
        };
        automator.hasPlayerGameStarted = async (id, week) => week === 1;
        automator.isPlayerOnBye = async () => false;
        automator.getWeeklyScores = async () => ({});

        await automator.dataLayer.loadSeason(2026, 'test-league');
        const events = await automator.processDuoSlots(3);

        const slotAfter = supabase._store.duos.find(d => d.team_id === teamId && d.player_index === 0);
        const logRow = supabase._store.substitutions.find(s => s.team_id === teamId && s.no_replacement_available === true);

        allPassed &= check('Injured player stays in the slot (still legitimately theirs)', slotAfter?.sleeper_player_id === 'p-hurt');
        allPassed &= check('A no_replacement_available=true history entry was logged (previously: nothing at all)', !!logRow);
        allPassed &= check('The logged entry has no substitute (null), correctly reflecting nobody was found', logRow?.substitute_name === null && logRow?.substitute_player_id === null);
        allPassed &= check('An event was pushed for this run (no-replacement)', events.some(e => e.type === 'no-replacement'));
    }

    // --- Scenario 2: permanent departure, no eligible replacement anywhere ---
    {
        const supabase = createClient();
        // createClient() returns a process-wide singleton mock store, not a
        // fresh one per call - clear scenario 1's leftover data so it can't
        // bleed into this run.
        Object.keys(supabase._store).forEach(k => delete supabase._store[k]);

        const seasonId = 's2';
        const teamId = 'team-b';

        await supabase.from('seasons').insert({ id: seasonId, year: 2026, current_week: 3 });
        // manual_privilege already false -> forces the "auto-fill immediately" branch
        await supabase.from('teams').insert({ id: teamId, season_id: seasonId, display_name: 'TeamB', permanent_swaps_used: 2, manual_privilege: false });
        await supabase.from('duos').insert([
            { id: 'd3', team_id: teamId, award_type: 'main', player_index: 0, player_name: 'Gone QB', player_position: 'QB', sleeper_player_id: 'p-gone', source: 'import' },
            { id: 'd4', team_id: teamId, award_type: 'main', player_index: 1, player_name: 'Healthy RB', player_position: 'RB', sleeper_player_id: 'p-healthy-b', source: 'import' }
        ]);

        const automator = new BrownBellAutomator('test-league');
        automator.playersData = {
            'p-gone': { first_name: 'Gone', last_name: 'QB', position: 'QB', team: 'DAL', injury_status: null, years_exp: 5 },
            'p-healthy-b': { first_name: 'Healthy', last_name: 'RB', position: 'RB', team: 'DAL', injury_status: null, years_exp: 5 }
        };
        automator.leagueData = {
            // p-gone is NOT on the roster anymore (traded/released) - and no one
            // else is on the roster either, so no replacement can ever be found
            rosters: [{ owner_id: 'ob', roster_id: 2, players: ['p-healthy-b'] }],
            userMap: { ob: 'TeamB' }
        };
        automator.hasPlayerGameStarted = async (id, week) => week === 1;
        automator.isPlayerOnBye = async () => false;
        automator.getWeeklyScores = async () => ({});

        await automator.dataLayer.loadSeason(2026, 'test-league');
        const events = await automator.processDuoSlots(3);

        const slotAfter = supabase._store.duos.find(d => d.team_id === teamId && d.player_index === 0);
        const logRow = supabase._store.substitutions.find(s => s.team_id === teamId && s.no_replacement_available === true);

        allPassed &= check('Slot was CLEARED, not left pointing at the departed player', slotAfter === undefined);
        allPassed &= check('A no_replacement_available=true history entry was logged', !!logRow);
        allPassed &= check('The logged entry correctly names the departed player as "original"', logRow?.original_name === 'Gone QB');
        allPassed &= check('An event was pushed for this run (no-replacement)', events.some(e => e.type === 'no-replacement'));
    }

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
