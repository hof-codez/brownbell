// test-prune-pagination-fix.js
// Proves a real, confirmed production bug and its fix: Supabase silently
// caps any .select() with no explicit range at 1000 rows. With a table
// of 6000+ saved Google News items, pruneDisqualifiedNews only ever
// checked the first 1000 rows returned - the specific disqualified rows
// a real user reported were simply never evaluated, since the table had
// grown well past that window.
//
// Also proves the companion fix at the source: capping saved items per
// player per run to the most recent 20, since the UI only ever displays
// 15 - this is what let a single run save 6000+ items in the first place.

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
    const supabase = createClient();
    const automator = new BrownBellAutomator('test-league');
    automator.playersData = { '4034': { first_name: 'Christian', last_name: 'McCaffrey' } };

    const rows = [];
    for (let i = 0; i < 1500; i++) {
        rows.push({
            id: `n${i}`,
            rotowire_guid: `google-4034-${i}`,
            headline: i === 1200 ? 'Kalshi promo code: bet on the game' : `McCaffrey update number ${i}`,
            source_name: 'Test Source',
            sleeper_player_id: '4034',
            player_name: 'Christian McCaffrey'
        });
    }
    await supabase.from('player_news').insert(rows);

    const loaded = await automator.dataLayer.loadAllPlayerNewsForPruning();
    allPassed &= check('loadAllPlayerNewsForPruning retrieves ALL 1500 rows, not just the first 1000', loaded.length === 1500);

    await automator.pruneDisqualifiedNews();
    const remaining = supabase._store.player_news;
    allPassed &= check('The disqualified row planted past the old 1000-row boundary is actually pruned', !remaining.some(r => r.id === 'n1200'));
    allPassed &= check('Exactly 1499 genuinely valid rows remain (only the 1 planted bad row removed)', remaining.length === 1499);

    const manyItemsXml = Array.from({ length: 50 }, (_, i) => {
        const date = new Date('2026-08-01T00:00:00Z');
        date.setUTCHours(date.getUTCHours() + i); // 50 distinct, always-valid hours
        return `<item><title>McCaffrey Update ${i}</title><link>https://x.com/${i}</link><guid>g${i}</guid><pubDate>${date.toUTCString()}</pubDate><source url='https://x.com'>Test</source></item>`;
    }).join('');

    await supabase.from('player_news').delete().in('id', supabase._store.player_news.map(r => r.id));
    automator.fetchText = async () => manyItemsXml;
    automator.knownDuos = { main: { TeamA: [{ sleeperId: '4034' }] }, nextup: {}, boom: {} };
    await automator.fetchAndSaveGoogleNews();

    const savedAfterCap = supabase._store.player_news;
    allPassed &= check('Saves at most 20 items per player per run, not all 50 available', savedAfterCap.length === 20);
    const savedGuids = savedAfterCap.map(r => r.rotowire_guid).sort();
    const expectedMostRecentGuids = Array.from({ length: 20 }, (_, i) => `google-4034-g${49 - i}`).sort();
    allPassed &= check('Keeps the 20 MOST RECENT by date, not an arbitrary slice', JSON.stringify(savedGuids) === JSON.stringify(expectedMostRecentGuids));

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
