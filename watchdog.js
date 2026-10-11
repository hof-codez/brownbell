// watchdog.js
//
// Solves a real, documented GitHub Actions limitation: the `schedule`
// trigger is explicitly "best effort" and gets deprioritized under
// platform-wide load. Confirmed directly via a real production report -
// a 15-minute cron schedule was actually firing roughly every 90-120
// minutes during a live Sunday NFL window, matching widely-reported
// community experience of the exact same symptom (GitHub's own docs:
// "the schedule event can be delayed during periods of high loads... if
// the load is sufficiently high enough, some queued jobs may be
// dropped"). This isn't a bug in this automation - it's Actions' shared
// scheduling infrastructure getting contended by every other repo's cron
// jobs firing on the same round 15-minute marks.
//
// The fix doesn't try to make the unreliable part (starting a new
// scheduled run every 15 minutes) more reliable. Instead, it avoids
// needing to: a handful of low-frequency triggers (one per game window,
// see update-standings.yml) start THIS script once, and once a job has
// actually started, it is NOT subject to that same scheduling-queue delay
// - the delay is specifically in starting a new run, not in how long an
// already-running one takes. This script loops internally from there,
// sleeping 15 minutes between each real check, for up to a fixed duration
// before exiting cleanly - safely under GitHub Actions' 6-hour job time
// limit. A game window longer than that (a full Saturday/Sunday slate)
// needs multiple watchdog-start triggers back to back, each covering a
// chunk of the day, rather than one watchdog trying to cover all of it.
//
// A fresh BrownBellAutomator instance is created for each loop iteration,
// deliberately mirroring how every other invocation of this automation
// already works (a clean process/instance per run), rather than reusing
// one instance across iterations - this avoids introducing any new class
// of cross-iteration state bug for a very small, one-time cost per
// iteration (re-resolving season/team id mappings).
//
// One bad iteration never stops the loop - a transient failure (a Sleeper
// API hiccup, a brief Supabase blip) still leaves the rest of the game
// window covered by the next attempt 15 minutes later, since stopping
// entirely would defeat the whole point of the watchdog. But failures
// aren't silently swallowed either: if ANY iteration fails, the whole
// script still exits non-zero at the very end (after every iteration has
// had its normal chance to run), so the existing "Alert on failure" GitHub
// Issue step in update-standings.yml still fires and surfaces it - full
// window coverage AND failure visibility, not one traded for the other.

const BrownBellAutomator = require('./update-standings.js');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Parameterized (not reading env/hardcoding internally) specifically so
// this can be exercised directly by a real automated test with tiny
// durations, rather than only ever being verifiable by actually waiting
// through real 15-minute sleeps. `createAutomator` is injectable for the
// same reason - a test can stub it to avoid real network calls entirely.
async function runWatchdogLoop({ maxDurationMs, loopIntervalMs, createAutomator, sleepFn = sleep }) {
    const startTime = Date.now();
    let iteration = 0;
    let failureCount = 0;

    console.log(`🐕 Watchdog starting - will loop every ${(loopIntervalMs / 60000).toFixed(1)} min for up to ${(maxDurationMs / 60000).toFixed(0)} minutes`);

    while (Date.now() - startTime < maxDurationMs) {
        iteration++;
        const elapsedMinutes = ((Date.now() - startTime) / 60000).toFixed(1);
        console.log(`\n--- Watchdog iteration ${iteration} (${elapsedMinutes} min elapsed) ---`);

        try {
            const automator = createAutomator();
            await automator.run();
        } catch (error) {
            failureCount++;
            console.error(`⚠️ Watchdog iteration ${iteration} failed (continuing - next attempt in ${(loopIntervalMs / 60000).toFixed(1)} min):`, error);
        }

        const remainingMs = maxDurationMs - (Date.now() - startTime);
        if (remainingMs <= 0) break;

        const sleepMs = Math.min(loopIntervalMs, remainingMs);
        console.log(`Sleeping ${(sleepMs / 60000).toFixed(1)} min until next check...`);
        await sleepFn(sleepMs);
    }

    console.log(`\n🐕 Watchdog finished after ${iteration} iteration(s), ${failureCount} failure(s)`);

    return { iterations: iteration, failureCount };
}

module.exports = { runWatchdogLoop };

if (require.main === module) {
    process.env.WATCHDOG_MODE = 'true';

    const LOOP_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes, matching the original cron intent
    // Default 5.5 hours - safely under GitHub Actions' 6-hour job time
    // limit, leaving margin for a slow iteration or a delayed job start.
    // Overridden per watchdog-start trigger in update-standings.yml so
    // each one covers its own chunk of a longer game day without
    // overlapping past it.
    const MAX_DURATION_MS = (Number(process.env.WATCHDOG_DURATION_MINUTES) || 330) * 60 * 1000;
    const leagueId = process.env.SLEEPER_LEAGUE_ID || '1313661584425385984';

    runWatchdogLoop({
        maxDurationMs: MAX_DURATION_MS,
        loopIntervalMs: LOOP_INTERVAL_MS,
        createAutomator: () => new BrownBellAutomator(leagueId)
    })
        .then(({ failureCount }) => process.exit(failureCount > 0 ? 1 : 0))
        .catch(error => {
            // A crash in the watchdog's own loop logic (not a
            // per-iteration automation failure, which is already caught
            // inside the loop) - this is the one case that should stop
            // immediately rather than continue.
            console.error('🚨 Watchdog itself crashed:', error);
            process.exit(1);
        });
}
