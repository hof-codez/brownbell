// test-boom-vacancy-lifecycle.js
// End-to-end test of the actual new behavior: an injury is detected, the
// slot clears (does NOT immediately auto-fill), stays empty across a run
// where there's still plenty of time, then auto-fills once the best
// candidate's kickoff becomes imminent - and separately, confirms the
// original player reverting to healthy still works correctly even after
// a stand-in has been auto-filled in the meantime. Also confirms the 2nd
// permanent departure still auto-fills immediately with no owner window,
// exactly as before - the one case explicitly meant to stay unchanged.
//
// Each "run" simulates a different point in time by setting the relevant
// schedule date relative to the REAL current moment (Date.now()) - the
// eligibility checks use the actual wall clock, not an injectable time, so
// hardcoded calendar dates would not produce the intended "N minutes from
// now" scenario at all.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

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
    await supabase.from('seasons').insert({ id: 's1', year: 2026 });
    await supabase.from('teams').insert({ id: 't1', season_id: 's1', display_name: 'TeamA', permanent_swaps_used: 0, manual_privilege: true });
    await supabase.from('duos').insert([
        { id: 'd1', team_id: 't1', award_type: 'boom', player_index: 0, player_name: 'Injured Guy', player_position: 'LB', sleeper_player_id: 'p-injured', original_sleeper_player_id: 'p-injured' },
        { id: 'd2', team_id: 't1', award_type: 'boom', player_index: 1, player_name: 'Bench DB', player_position: 'DB', sleeper_player_id: 'p-bench', original_sleeper_player_id: 'p-bench' }
    ]);

    const automator = new BrownBellAutomator('test-league');
    automator.playersData = {
        'p-injured': { first_name: 'Injured', last_name: 'Guy', position: 'LB', team: 'DAL', injury_status: 'Out', years_exp: 5 },
        'p-bench': { first_name: 'Bench', last_name: 'DB', position: 'DB', team: 'DAL', injury_status: null, years_exp: 3 },
        'p-idp1': { first_name: 'IDP', last_name: 'One', position: 'DL', team: 'KC', injury_status: null, years_exp: 2 }
    };
    automator.leagueData = {
        rosters: [{ owner_id: 'oa', roster_id: 1, players: ['p-injured', 'p-bench', 'p-idp1'] }],
        userMap: { oa: 'TeamA' }
    };
    automator.hasPlayerGameStarted = async () => true; // season-long pick lock already passed
    automator.getWeeklyScores = async () => ({});
    await automator.dataLayer.loadSeason(2026, 'test-league');

    // --- Run 1: injury just detected, best candidate's kickoff is 30 min out ---
    automator.cachedSchedule = { 3: { DAL: { date: minutesFromNow(120) }, KC: { date: minutesFromNow(30) } } };
    let events = await automator.processDuoSlots(3);
    let d1 = supabase._store.duos.find(d => d.id === 'd1');
    allPassed &= check('Run 1 (30 min out): slot is CLEARED, not immediately auto-filled', d1.sleeper_player_id === null);
    allPassed &= check('Run 1: original_sleeper_player_id preserved through the clear', d1.original_sleeper_player_id === 'p-injured');
    allPassed &= check('Run 1: correct event type logged', events.some(e => e.type === 'boom-temporary-cleared-for-owner'));

    // --- Run 2: still 20 min out - automation runs again, nothing should change ---
    automator.cachedSchedule[3].KC.date = minutesFromNow(20);
    events = await automator.processDuoSlots(3);
    d1 = supabase._store.duos.find(d => d.id === 'd1');
    allPassed &= check('Run 2 (20 min out): STILL waiting, not prematurely auto-filled', d1.sleeper_player_id === null);

    // --- Run 3: now only 10 min until kickoff - auto-sub should kick in ---
    automator.cachedSchedule[3].KC.date = minutesFromNow(10);
    events = await automator.processDuoSlots(3);
    d1 = supabase._store.duos.find(d => d.id === 'd1');
    allPassed &= check('Run 3 (10 min out): auto-sub correctly kicks in now', d1.sleeper_player_id === 'p-idp1');
    allPassed &= check('Run 3: correct event type logged', events.some(e => e.type === 'boom-auto-fill-near-kickoff'));

    // --- Run 4: the ORIGINAL player is healthy again - should revert, even
    //     though an auto-filled stand-in is currently in place ---
    automator.playersData['p-injured'].injury_status = null;
    events = await automator.processDuoSlots(3);
    d1 = supabase._store.duos.find(d => d.id === 'd1');
    allPassed &= check('Run 4: reverted back to the original player now that they\'re healthy', d1.sleeper_player_id === 'p-injured');
    allPassed &= check('Run 4: correct event type logged', events.some(e => e.type === 'reverted'));

    // --- Separately: confirm the 2nd permanent departure still auto-fills
    //     immediately, with NO owner window - the one case meant to stay unchanged ---
    {
        const supabase2 = createClient();
        Object.keys(supabase2._store).forEach(k => delete supabase2._store[k]);
        await supabase2.from('seasons').insert({ id: 's2', year: 2026 });
        await supabase2.from('teams').insert({ id: 't2', season_id: 's2', display_name: 'TeamB', permanent_swaps_used: 1, manual_privilege: false });
        await supabase2.from('duos').insert([
            { id: 'd3', team_id: 't2', award_type: 'boom', player_index: 0, player_name: 'Gone Guy', player_position: 'LB', sleeper_player_id: 'p-gone', original_sleeper_player_id: 'p-gone' },
            { id: 'd4', team_id: 't2', award_type: 'boom', player_index: 1, player_name: 'Other DB', player_position: 'DB', sleeper_player_id: 'p-other', original_sleeper_player_id: 'p-other' }
        ]);

        const automator2 = new BrownBellAutomator('test-league-2');
        automator2.playersData = {
            'p-gone': { first_name: 'Gone', last_name: 'Guy', position: 'LB', team: 'DAL', injury_status: null, years_exp: 5 },
            'p-other': { first_name: 'Other', last_name: 'DB', position: 'DB', team: 'DAL', injury_status: null, years_exp: 3 },
            'p-idp2': { first_name: 'IDP', last_name: 'Two', position: 'DL', team: 'KC', injury_status: null, years_exp: 1 }
        };
        automator2.leagueData = {
            rosters: [{ owner_id: 'ob', roster_id: 2, players: ['p-other', 'p-idp2'] }], // p-gone traded away, no longer rostered
            userMap: { ob: 'TeamB' }
        };
        automator2.cachedSchedule = { 3: { DAL: { date: minutesFromNow(60) }, KC: { date: minutesFromNow(60) } } };
        automator2.hasPlayerGameStarted = async () => true;
        automator2.getWeeklyScores = async () => ({});
        await automator2.dataLayer.loadSeason(2026, 'test-league-2');

        await automator2.processDuoSlots(3);
        const d3 = supabase2._store.duos.find(d => d.id === 'd3');
        allPassed &= check(
            '2nd permanent departure still auto-fills IMMEDIATELY (no owner window) - the one case explicitly unchanged',
            d3.sleeper_player_id === 'p-idp2'
        );
    }

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
