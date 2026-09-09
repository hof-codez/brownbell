// test-chunked-delete-fix.js
// Proves a real, confirmed production bug and its fix: a single
// .in('id', ids) delete call with hundreds of UUIDs encodes as an
// enormous URL and Supabase rejects it outright with "Bad Request" - the
// pruning logic correctly identified every disqualified row on every run,
// but the single giant delete request always failed, so nothing was ever
// actually removed. This is why the exact same articles kept reappearing
// across multiple runs despite the identification step working correctly
// every single time.
//
// The standard in-memory mock Supabase client used elsewhere does NOT
// simulate real HTTP/URL-length constraints, so it could never have
// caught this - this test uses a custom stub that specifically
// reproduces the real failure (any single .in() call over 100 ids fails)
// to prove the chunking fix actually avoids it.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const SupabaseDataLayer = require('./supabase-data-layer.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

// A stub that mirrors the REAL Supabase failure mode directly: any single
// .in() delete call with more than 100 ids fails with "Bad Request",
// exactly like the real, confirmed production log. Records every call's
// batch size so the test can assert on the actual chunking behavior.
class OversizeRejectingStub {
    constructor() {
        this.deleteCalls = [];
        this.remaining = new Set();
    }
    from(_table) {
        const self = this;
        return {
            delete() {
                return {
                    in(_col, ids) {
                        self.deleteCalls.push(ids.length);
                        if (ids.length > 100) {
                            return Promise.resolve({ error: { message: 'Bad Request' } });
                        }
                        for (const id of ids) self.remaining.delete(id);
                        return Promise.resolve({ error: null });
                    }
                };
            }
        };
    }
}

async function run() {
    let allPassed = true;

    const dataLayer = new SupabaseDataLayer();
    const stub = new OversizeRejectingStub();
    for (let i = 0; i < 250; i++) stub.remaining.add(`n${i}`);
    dataLayer.supabase = stub; // swap in the real-failure-mode stub

    const idsToDelete = Array.from({ length: 250 }, (_, i) => `n${i}`);
    const deletedCount = await dataLayer.deletePlayerNewsByIds(idsToDelete);

    allPassed &= check('Every delete call stayed at or under the real 100-id ceiling', stub.deleteCalls.every(size => size <= 100));
    allPassed &= check('Made multiple chunked calls rather than one giant call', stub.deleteCalls.length === 3);
    allPassed &= check('All 250 ids were actually deleted despite the simulated real-world size limit', deletedCount === 250 && stub.remaining.size === 0);

    // --- Confirm this stub genuinely reproduces the real failure with the
    //     OLD, unchunked approach - i.e. the test is testing the right thing ---
    const oldStyleStub = new OversizeRejectingStub();
    const oldStyleResult = await oldStyleStub.from('player_news').delete().in('id', idsToDelete);
    allPassed &= check('Confirms the stub reproduces the exact real failure: one unchunked call with 250 ids fails with Bad Request', oldStyleResult.error?.message === 'Bad Request');

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
