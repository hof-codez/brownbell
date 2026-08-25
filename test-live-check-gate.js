// test-live-check-gate.js
// Verifies: a LIVE_CHECK checkpoint does nothing (no Supabase writes, cheap
// early return) when no game is currently in progress, and proceeds with a
// real update when at least one game IS in progress. This is the mechanism
// that makes 15-minute polling safe to run generously - the cron window
// wakes the job up often, but only real game time costs anything.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';
process.env.NFL_SEASON_YEAR = '2026';

const { createClient } = require('@supabase/supabase-js');
const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

function baseSetup() {
    const automator = new BrownBellAutomator('1313661584425385984');
    automator.initializeLeagueData = async () => {
        automator.playersData = {};
        automator.leagueData = { rosters: [], userMap: {} };
    };
    automator.getCurrentWeek = async () => 3;
    return automator;
}

async function run() {
    let allPassed = true;

    // --- Scenario 1: LIVE_CHECK fires, but no game is actually in progress ---
    {
        const supabase = createClient();
        await supabase.from('seasons').insert({ id: 's1', year: 2026, current_week: 3, sleeper_league_id: '1313661584425385984' });

        const automator = baseSetup();
        // Schedule shows only pre-game and finished games - nothing 'in' progress
        automator.fetchNFLSchedule = async () => ({
            DAL: { date: new Date(), opponent: 'PHI', status: 'pre' },
            PHI: { date: new Date(), opponent: 'DAL', status: 'pre' },
            KC: { date: new Date(), opponent: 'BUF', status: 'post' },
            BUF: { date: new Date(), opponent: 'KC', status: 'post' }
        });

        process.env.CRON_SCHEDULE = '*/15 13-23 * * 0';
        const result = await automator.run();

        allPassed &= check('Skipped run reports LIVE_CHECK_SKIPPED', result.lastCheckpointType === 'LIVE_CHECK_SKIPPED');
        const writeTables = ['duos', 'weekly_scores', 'substitutions', 'bonus_results', 'schedule_snapshots', 'schedule_changes'];
        allPassed &= check(
            'Skipped run made NO writes to any output table (duos, scores, substitutions, etc.)',
            writeTables.every(table => (supabase._store[table] || []).length === 0)
        );
    }

    // --- Scenario 2: LIVE_CHECK fires, and a game IS actually in progress ---
    {
        const supabase = createClient();
        await supabase.from('seasons').insert({ id: 's2', year: 2026, current_week: 3, sleeper_league_id: '1313661584425385984' });

        const automator = baseSetup();
        automator.fetchNFLSchedule = async () => ({
            DAL: { date: new Date(), opponent: 'PHI', status: 'in' }, // live right now
            PHI: { date: new Date(), opponent: 'DAL', status: 'in' }
        });
        automator.getWeeklyScores = async () => ({});
        automator.hasPlayerGameStarted = async () => false;

        process.env.CRON_SCHEDULE = '*/15 13-23 * * 0';
        const result = await automator.run();

        allPassed &= check('Live run does NOT report LIVE_CHECK_SKIPPED (real update proceeded)', result.lastCheckpointType !== 'LIVE_CHECK_SKIPPED');
        allPassed &= check('Live run reports the real LIVE_CHECK checkpoint type', result.lastCheckpointType === 'LIVE_CHECK');
    }

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
