// test-manual-trigger-checkpoint.js
// Proves a real production bug and its fix: a manual "Run workflow" click
// on the actual GitHub Actions workflow, with no checkbox inputs set,
// previously fell through to a day/hour fallback with NO coverage at all
// for Wednesday or Friday - on either of those days, checkpointType stayed
// null and shouldRunSubstitutions stayed false, meaning roster-change
// detection silently never ran for that click, while everything else
// (scores, schedule) updated normally with no indication anything was
// skipped.
//
// The fix: GITHUB_ACTIONS (set by the runner for every workflow run,
// scheduled or manual) is checked before the day/hour fallback - a genuine
// manual trigger of the real workflow now always runs substitutions
// regardless of day, while a true local/dev run (GITHUB_ACTIONS unset)
// still uses the original day-of-week heuristic.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

async function run() {
    let allPassed = true;
    const automator = new BrownBellAutomator('test-league');

    const originalEnv = { ...process.env };
    function resetEnv() {
        for (const key of ['GITHUB_ACTIONS', 'CRON_SCHEDULE', 'FORCE_SUBSTITUTIONS', 'PREGAME_CHECK', 'INTERNATIONAL_CHECK']) {
            delete process.env[key];
        }
    }

    resetEnv();
    process.env.GITHUB_ACTIONS = 'true';
    let result = automator.determineCheckpoint(3, 12); // Wednesday, noon
    allPassed &= check('Manual GitHub Actions trigger on Wednesday now runs substitutions (previously silently skipped)', result.shouldRunSubstitutions === true);
    allPassed &= check('Wednesday manual trigger gets a real checkpoint type, not null', result.checkpointType === 'MANUAL_TRIGGER');

    result = automator.determineCheckpoint(5, 12); // Friday, noon
    allPassed &= check('Manual GitHub Actions trigger on Friday now runs substitutions (previously silently skipped)', result.shouldRunSubstitutions === true);

    for (let day = 0; day <= 6; day++) {
        result = automator.determineCheckpoint(day, 12);
        allPassed &= check(`Manual GitHub Actions trigger on day ${day} runs substitutions`, result.shouldRunSubstitutions === true);
    }

    resetEnv();
    process.env.GITHUB_ACTIONS = 'true';
    process.env.CRON_SCHEDULE = '0 14 * * 2';
    result = automator.determineCheckpoint(2, 7);
    allPassed &= check('A real scheduled Tuesday run still resolves to TUESDAY_CHECK, not MANUAL_TRIGGER', result.checkpointType === 'TUESDAY_CHECK');

    resetEnv();
    process.env.GITHUB_ACTIONS = 'true';
    process.env.CRON_SCHEDULE = '*/15 13-23 * * 0';
    result = automator.determineCheckpoint(0, 14);
    allPassed &= check('A real scheduled Sunday live-window run still resolves to LIVE_CHECK', result.checkpointType === 'LIVE_CHECK');

    // --- Wednesday and Saturday live-check windows, added after a real
    //     confirmed gap: the actual 2026 season opener (a special one-off
    //     kickoff game) landed on a Wednesday night, a day with NO
    //     live-check coverage at all under the original Thu/Sun/Mon-only
    //     schedule - every score update that week only happened because
    //     the workflow was manually re-triggered by hand. ---
    resetEnv();
    process.env.GITHUB_ACTIONS = 'true';
    process.env.CRON_SCHEDULE = '*/15 23 * * 3';
    result = automator.determineCheckpoint(3, 16);
    allPassed &= check('A scheduled Wednesday-night live-window run resolves to LIVE_CHECK (the actual 2026 opener slot)', result.checkpointType === 'LIVE_CHECK');

    resetEnv();
    process.env.GITHUB_ACTIONS = 'true';
    process.env.CRON_SCHEDULE = '*/15 0-4 * * 4';
    result = automator.determineCheckpoint(4, 1);
    allPassed &= check('The Wednesday-night window\'s Thursday-early-morning wrap resolves to LIVE_CHECK', result.checkpointType === 'LIVE_CHECK');

    resetEnv();
    process.env.GITHUB_ACTIONS = 'true';
    process.env.CRON_SCHEDULE = '*/15 13-23 * * 6';
    result = automator.determineCheckpoint(6, 18);
    allPassed &= check('A scheduled Saturday live-window run resolves to LIVE_CHECK (late-season Saturday games)', result.checkpointType === 'LIVE_CHECK');

    resetEnv();
    process.env.GITHUB_ACTIONS = 'true';
    process.env.CRON_SCHEDULE = '*/15 0-4 * * 0';
    result = automator.determineCheckpoint(0, 1);
    allPassed &= check('The Saturday window\'s Sunday-early-morning wrap resolves to LIVE_CHECK', result.checkpointType === 'LIVE_CHECK');

    resetEnv();
    result = automator.determineCheckpoint(3, 12); // Wednesday, no GITHUB_ACTIONS
    allPassed &= check('A genuine local dev run on Wednesday still has no checkpoint (unchanged local-run behavior)', result.checkpointType === null && result.shouldRunSubstitutions === false);

    result = automator.determineCheckpoint(2, 12); // Tuesday, no GITHUB_ACTIONS
    allPassed &= check('A genuine local dev run on Tuesday still uses the day-of-week fallback', result.checkpointType === 'TUESDAY_CHECK');

    process.env = originalEnv;

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
