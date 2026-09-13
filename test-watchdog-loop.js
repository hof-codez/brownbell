// test-watchdog-loop.js
// Proves the watchdog loop's core behavior with tiny, fast durations
// rather than real 15-minute sleeps: it runs multiple iterations within
// its configured window, a failed iteration doesn't stop the loop (the
// rest of the window still gets covered), the exit-relevant failureCount
// is accurate, and it stops once its duration is up rather than running
// forever. This is what actually solves a real, confirmed GitHub Actions
// limitation - the `schedule` trigger silently firing every ~90-120
// minutes instead of every 15 during high platform load - by moving the
// 15-minute cadence into a loop inside one already-started job, which
// isn't subject to that same scheduling-queue delay.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const { runWatchdogLoop } = require('./watchdog.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

function tinyRealSleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    let allPassed = true;

    // --- All iterations succeed: runs the expected number of times,
    //     reports zero failures, and the caller can tell it was clean ---
    let runCallCount = 0;
    const successResult = await runWatchdogLoop({
        maxDurationMs: 100,
        loopIntervalMs: 20,
        createAutomator: () => ({ run: async () => { runCallCount++; } }),
        sleepFn: tinyRealSleep
    });
    allPassed &= check('Runs multiple iterations within its window', successResult.iterations >= 3 && successResult.iterations <= 8);
    allPassed &= check('Reports zero failures when every iteration succeeds', successResult.failureCount === 0);
    allPassed &= check('Actually calls automator.run() once per iteration', runCallCount === successResult.iterations);

    // --- A failing iteration does not stop the loop - the rest of the
    //     window still gets covered by later attempts ---
    let attemptCount = 0;
    const partialFailureResult = await runWatchdogLoop({
        maxDurationMs: 100,
        loopIntervalMs: 20,
        createAutomator: () => ({
            run: async () => {
                attemptCount++;
                if (attemptCount === 2) throw new Error('simulated transient failure');
            }
        }),
        sleepFn: tinyRealSleep
    });
    allPassed &= check('One failed iteration does not stop the loop early', partialFailureResult.iterations >= 3);
    allPassed &= check('Failure count accurately reflects exactly the one bad iteration', partialFailureResult.failureCount === 1);

    // --- A fresh automator instance per iteration (never reused) ---
    const createdInstances = [];
    await runWatchdogLoop({
        maxDurationMs: 60,
        loopIntervalMs: 20,
        createAutomator: () => {
            const instance = { id: createdInstances.length, run: async () => {} };
            createdInstances.push(instance);
            return instance;
        },
        sleepFn: tinyRealSleep
    });
    allPassed &= check('Creates a fresh automator instance for every iteration, never reusing one', createdInstances.length >= 2 && new Set(createdInstances.map(i => i.id)).size === createdInstances.length);

    // --- Stops once the configured duration is exceeded, rather than
    //     looping forever or overshooting wildly ---
    const startedAt = Date.now();
    await runWatchdogLoop({
        maxDurationMs: 50,
        loopIntervalMs: 20,
        createAutomator: () => ({ run: async () => {} }),
        sleepFn: tinyRealSleep
    });
    const actualElapsed = Date.now() - startedAt;
    allPassed &= check('Stops within a reasonable margin of its configured duration, not running away', actualElapsed < 200);

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
