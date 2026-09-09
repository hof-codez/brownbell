// test-google-news-search.js
// Proves the per-player Google News search integration: correctly parses
// standard RSS 2.0 search results, strips the " - Source Name" suffix
// Google appends to every title (using the <source> tag's own text
// rather than guessing a separator position), keeps headline+source only
// (no snippet body, since these span many independent outlets this app
// has no individual permission to quote from), and produces a stable,
// namespaced dedup key distinct from the RotoWire-sourced guids.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const { createClient } = require('@supabase/supabase-js');
const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

const SIMULATED_GOOGLE_NEWS_XML = `<?xml version='1.0' encoding='UTF-8'?>
<rss version='2.0'>
<channel>
<item>
<title>McCaffrey Fully Dressed for Latest Practice - Fox Sports</title>
<link>https://news.google.com/rss/articles/xyz1</link>
<guid isPermaLink='false'>xyz1-guid</guid>
<pubDate>Tue, 08 Sep 2026 14:00:00 GMT</pubDate>
<source url='https://foxsports.com'>Fox Sports</source>
</item>
<item>
<title>Christian McCaffrey Injury Update: What's the Latest - Yahoo Sports</title>
<link>https://news.google.com/rss/articles/xyz2</link>
<guid isPermaLink='false'>xyz2-guid</guid>
<pubDate>Mon, 07 Sep 2026 09:00:00 GMT</pubDate>
<source url='https://sports.yahoo.com'>Yahoo Sports</source>
</item>
</channel>
</rss>`;

async function run() {
    let allPassed = true;
    const supabase = createClient();
    const automator = new BrownBellAutomator('test-league');

    const items = automator.parseGoogleNewsFeed(SIMULATED_GOOGLE_NEWS_XML, '4034', 'Christian McCaffrey', 'McCaffrey');

    allPassed &= check('Extracts both items', items.length === 2);
    allPassed &= check('Strips the trailing " - Fox Sports" suffix cleanly', items[0].headline === 'McCaffrey Fully Dressed for Latest Practice');
    allPassed &= check('Strips the trailing " - Yahoo Sports" suffix cleanly', items[1].headline === "Christian McCaffrey Injury Update: What's the Latest");
    allPassed &= check('Snippet is deliberately empty - no factual blurb, headline+source only', items[0].snippet === '' && items[1].snippet === '');
    allPassed &= check('Source name is captured separately for correct frontend attribution', items[0].sourceName === 'Fox Sports' && items[1].sourceName === 'Yahoo Sports');
    allPassed &= check('Guid is namespaced distinctly from RotoWire-sourced items', items[0].rotowireGuid === 'google-4034-xyz1-guid');
    allPassed &= check('Dates parsed correctly', items[0].publishedAt.toDateString().includes('Sep 08 2026'));

    // A title with no matching <source> suffix at all (defensive fallback)
    const noSourceXml = `<item><title>McCaffrey headline with no source suffix</title><link>https://x.com/a</link><guid>g1</guid><pubDate>Tue, 08 Sep 2026 14:00:00 GMT</pubDate></item>`;
    const fallbackItems = automator.parseGoogleNewsFeed(noSourceXml, '4034', 'Christian McCaffrey', 'McCaffrey');
    allPassed &= check('Falls back to the raw title when there is no source tag to strip', fallbackItems[0]?.headline === 'McCaffrey headline with no source suffix');

    // --- Title-match requirement: only articles genuinely ABOUT this
    //     player, not just mentioning him in a broader roundup piece ---
    const roundupXml = `<item><title>49ers Injury Report: Kittle, Purdy Update Statuses - ESPN</title><link>https://x.com/b</link><guid>g2</guid><pubDate>Tue, 08 Sep 2026 14:00:00 GMT</pubDate><source url='https://espn.com'>ESPN</source></item>`;
    const roundupItems = automator.parseGoogleNewsFeed(roundupXml, '4034', 'Christian McCaffrey', 'McCaffrey');
    allPassed &= check('Excludes a roundup article that never names this player in the title', roundupItems.length === 0);

    const aboutHimXml = `<item><title>McCaffrey Returns to Practice - ESPN</title><link>https://x.com/c</link><guid>g3</guid><pubDate>Tue, 08 Sep 2026 14:00:00 GMT</pubDate><source url='https://espn.com'>ESPN</source></item>`;
    const aboutHimItems = automator.parseGoogleNewsFeed(aboutHimXml, '4034', 'Christian McCaffrey', 'McCaffrey');
    allPassed &= check('Keeps an article that genuinely names this player (last name only) in the title', aboutHimItems.length === 1);

    // --- Backward compatible: omitting lastName (old call shape) skips
    //     this filter entirely rather than throwing or dropping everything ---
    const noLastNameItems = automator.parseGoogleNewsFeed(roundupXml, '4034', 'Christian McCaffrey');
    allPassed &= check('Omitting lastName does not apply the title-match filter (backward compatible)', noLastNameItems.length === 1);

    // Saves correctly into the existing player_news pipeline
    await supabase.from('seasons').insert({ id: 's1', year: 2026 });
    await automator.dataLayer.loadSeason(2026, 'test-league');
    await automator.dataLayer.savePlayerNews(items);
    allPassed &= check('Saves cleanly into the shared player_news table', supabase._store.player_news.length === 2);

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
