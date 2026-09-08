// test-permanent-vacancy-lifecycle.js
// (Formerly test-boom-vacancy-lifecycle.js - broadened since the
// clear-wait-then-auto-fill lifecycle is no longer boom-only.)
//
// Covers two things:
//
// 1. The permanent-departure lifecycle, now universal across all three
//    awards: a permanent departure clears the slot (does NOT immediately
//    auto-fill), stays empty across a run where there's still plenty of
//    time, then auto-fills once the best candidate's kickoff becomes
//    imminent. No revert case here - a genuinely permanent departure can
//    never come back, unlike a temporary injury.
//
// 2. Confirms Season of Boom's TEMPORARY (injury) handling now matches
//    Main Award/Next Up exactly: immediate auto-fill, with the original
//    correctly reverting once healthy again - no more clear-and-wait for
//    injuries. This was changed specifically so the Showdown tab's weekly
//    matchup and prediction poll always show a real current player rather
//    than a blank slot while an owner decides.
//
// Also confirms a permanent departure still auto-fills immediately with
// no owner window once that award's own swap is already used - unchanged
// from before, and independent of the other two awards' own budgets.
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

    // --- Part 1: permanent departure lifecycle (clear -> wait -> auto-fill) ---
    const supabase = createClient();
    await supabase.from('seasons').insert({ id: 's1', year: 2026 });
    await supabase.from('teams').insert({ id: 't1', season_id: 's1', display_name: 'TeamA', main_permanent_swap_used: false, nextup_permanent_swap_used: false, boom_permanent_swap_used: false });
    await supabase.from('duos').insert([
        // p-gone is NOT on the roster below - traded/released, a genuine
        // permanent departure, not an injury.
        { id: 'd1', team_id: 't1', award_type: 'boom', player_index: 0, player_name: 'Gone Guy', player_position: 'LB', sleeper_player_id: 'p-gone', original_sleeper_player_id: 'p-gone' },
        { id: 'd2', team_id: 't1', award_type: 'boom', player_index: 1, player_name: 'Bench DB', player_position: 'DB', sleeper_player_id: 'p-bench', original_sleeper_player_id: 'p-bench' }
    ]);

    const automator = new BrownBellAutomator('test-league');
    automator.playersData = {
        'p-gone': { first_name: 'Gone', last_name: 'Guy', position: 'LB', team: 'DAL', injury_status: null, years_exp: 5 },
        'p-bench': { first_name: 'Bench', last_name: 'DB', position: 'DB', team: 'DAL', injury_status: null, years_exp: 3 },
        'p-idp1': { first_name: 'IDP', last_name: 'One', position: 'DL', team: 'KC', injury_status: null, years_exp: 2 }
    };
    automator.leagueData = {
        // p-gone deliberately NOT included - traded/released, no longer rostered
        rosters: [{ owner_id: 'oa', roster_id: 1, players: ['p-bench', 'p-idp1'] }],
        userMap: { oa: 'TeamA' }
    };
    automator.hasPlayerGameStarted = async () => true; // season-long pick lock already passed
    automator.getWeeklyScores = async () => ({});
    await automator.dataLayer.loadSeason(2026, 'test-league');

    // --- Run 1: departure just detected, best candidate's kickoff is 30 min out ---
    // DAL (the departed original player's team) is fixed at a kickoff
    // earlier than every candidate kickoff tested below (30/20/10 min out)
    // - satisfying the new rule that a replacement's own game must start
    // at the same time or later than the player being replaced.
    automator.cachedSchedule = { 3: { DAL: { date: minutesFromNow(1) }, KC: { date: minutesFromNow(30) } } };
    let events = await automator.processDuoSlots(3);
    let d1 = supabase._store.duos.find(d => d.id === 'd1');
    allPassed &= check('Run 1 (30 min out): slot is CLEARED, not immediately auto-filled', d1.sleeper_player_id === null);
    allPassed &= check('Run 1: original_sleeper_player_id preserved through the clear', d1.original_sleeper_player_id === 'p-gone');
    allPassed &= check('Run 1: correct event type logged', events.some(e => e.type === 'permanent-cleared-for-owner'));

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
    allPassed &= check('Run 3: correct event type logged', events.some(e => e.type === 'permanent-auto-fill'));
    const teamAState = supabase._store.teams.find(t => t.id === 't1');
    allPassed &= check('This award\'s permanent swap is now marked used', teamAState.boom_permanent_swap_used === true);

    // --- Part 2: Season of Boom's temporary (injury) handling now matches
    //     Main Award/Next Up exactly - immediate auto-fill, no clear-and-wait ---
    {
        const supabase2 = createClient();
        Object.keys(supabase2._store).forEach(k => delete supabase2._store[k]);
        await supabase2.from('seasons').insert({ id: 's2', year: 2026 });
        await supabase2.from('teams').insert({ id: 't2', season_id: 's2', display_name: 'TeamC', main_permanent_swap_used: false, nextup_permanent_swap_used: false, boom_permanent_swap_used: false });
        await supabase2.from('duos').insert([
            { id: 'd5', team_id: 't2', award_type: 'boom', player_index: 0, player_name: 'Injured Guy', player_position: 'LB', sleeper_player_id: 'p-injured', original_sleeper_player_id: 'p-injured' },
            { id: 'd6', team_id: 't2', award_type: 'boom', player_index: 1, player_name: 'C Bench', player_position: 'DB', sleeper_player_id: 'p-c-bench', original_sleeper_player_id: 'p-c-bench' }
        ]);

        const automator2 = new BrownBellAutomator('test-league-c');
        automator2.playersData = {
            'p-injured': { first_name: 'Injured', last_name: 'Guy', position: 'LB', team: 'DAL', injury_status: 'Out', years_exp: 5 },
            'p-c-bench': { first_name: 'C', last_name: 'Bench', position: 'DB', team: 'DAL', injury_status: null, years_exp: 3 },
            'p-c-idp': { first_name: 'C', last_name: 'IDP', position: 'DL', team: 'KC', injury_status: null, years_exp: 2 }
        };
        automator2.leagueData = {
            rosters: [{ owner_id: 'oc', roster_id: 3, players: ['p-injured', 'p-c-bench', 'p-c-idp'] }],
            userMap: { oc: 'TeamC' }
        };
        automator2.hasPlayerGameStarted = async () => true;
        automator2.getWeeklyScores = async () => ({});
        // Boom's selectAutoReplacement always checks kickoff eligibility
        // (isEligibleForSub) regardless of whether it's a temporary or
        // permanent situation - needs a cached schedule or it attempts a
        // live fetch. Both candidates' games are comfortably far off.
        automator2.cachedSchedule = { 3: { DAL: { date: minutesFromNow(120) }, KC: { date: minutesFromNow(120) } } };
        await automator2.dataLayer.loadSeason(2026, 'test-league-c');

        const events2 = await automator2.processDuoSlots(3);
        const d5 = supabase2._store.duos.find(d => d.id === 'd5');
        allPassed &= check('Boom temporary injury: auto-fills IMMEDIATELY (no clear-and-wait), matching Main/Next Up', d5.sleeper_player_id === 'p-c-idp');
        allPassed &= check('Correct event type for immediate temporary fill', events2.some(e => e.type === 'temporary-fill'));

        // Original recovers - should revert, same as Main/Next Up already do.
        automator2.playersData['p-injured'].injury_status = null;
        const events3 = await automator2.processDuoSlots(3);
        const d5After = supabase2._store.duos.find(d => d.id === 'd5');
        allPassed &= check('Boom reverts back to the original player once healthy, same as Main/Next Up', d5After.sleeper_player_id === 'p-injured');
        allPassed &= check('Correct event type for the revert', events3.some(e => e.type === 'reverted'));
    }

    // --- Separately: confirm a permanent departure still auto-fills
    //     immediately, with NO owner window, once THIS award's (boom's) own
    //     swap is already used - independent of main/nextup's budgets ---
    {
        const supabase3 = createClient();
        Object.keys(supabase3._store).forEach(k => delete supabase3._store[k]);
        await supabase3.from('seasons').insert({ id: 's3', year: 2026 });
        await supabase3.from('teams').insert({ id: 't3', season_id: 's3', display_name: 'TeamB', main_permanent_swap_used: false, nextup_permanent_swap_used: false, boom_permanent_swap_used: true });
        await supabase3.from('duos').insert([
            { id: 'd3', team_id: 't3', award_type: 'boom', player_index: 0, player_name: 'Gone Guy', player_position: 'LB', sleeper_player_id: 'p-gone-b', original_sleeper_player_id: 'p-gone-b' },
            { id: 'd4', team_id: 't3', award_type: 'boom', player_index: 1, player_name: 'Other DB', player_position: 'DB', sleeper_player_id: 'p-other', original_sleeper_player_id: 'p-other' }
        ]);

        const automator3 = new BrownBellAutomator('test-league-2');
        automator3.playersData = {
            'p-gone-b': { first_name: 'Gone', last_name: 'Guy', position: 'LB', team: 'DAL', injury_status: null, years_exp: 5 },
            'p-other': { first_name: 'Other', last_name: 'DB', position: 'DB', team: 'DAL', injury_status: null, years_exp: 3 },
            'p-idp2': { first_name: 'IDP', last_name: 'Two', position: 'DL', team: 'KC', injury_status: null, years_exp: 1 }
        };
        automator3.leagueData = {
            rosters: [{ owner_id: 'ob', roster_id: 2, players: ['p-other', 'p-idp2'] }], // p-gone-b traded away, no longer rostered
            userMap: { ob: 'TeamB' }
        };
        automator3.cachedSchedule = { 3: { DAL: { date: minutesFromNow(60) }, KC: { date: minutesFromNow(60) } } };
        automator3.hasPlayerGameStarted = async () => true;
        automator3.getWeeklyScores = async () => ({});
        await automator3.dataLayer.loadSeason(2026, 'test-league-2');

        await automator3.processDuoSlots(3);
        const d3 = supabase3._store.duos.find(d => d.id === 'd3');
        allPassed &= check(
            'Permanent departure auto-fills IMMEDIATELY (no owner window) once boom\'s own swap is already used',
            d3.sleeper_player_id === 'p-idp2'
        );
        const teamBState = supabase3._store.teams.find(t => t.id === 't3');
        allPassed &= check('TeamB\'s main/nextup budgets are untouched by boom\'s already-used state - independent per award', teamBState.main_permanent_swap_used === false && teamBState.nextup_permanent_swap_used === false);
    }

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
