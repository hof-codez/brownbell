// test-player-news-pipeline.js
// Proves the RotoWire player-news pipeline end to end: parsing their RSS
// feed's specific format, matching each item to a Sleeper player by name
// (with common formatting differences like periods and suffixes handled),
// and persisting via savePlayerNews - including that a re-fetch of the
// same items never duplicates them (upserted on RotoWire's own guid).

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const { createClient } = require('@supabase/supabase-js');
const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>RotoWire.com Latest NFL News</title>
    <item>
        <guid>nfl636384</guid>
        <title>Christian Gonzalez: Inks extension with Patriots</title>
        <link>https://www.rotowire.com//football/player/christian-gonzalez-16683</link>
        <description>Gonzalez signed a four-year, $135 million extension, with $102 million guaranteed, with the Patriots on Monday, NFL reporter Jordan Schultz reports.

        Visit RotoWire.com for more analysis on this update.</description>
        <pubDate>Mon, 07 Sep 2026 10:04:00 PM PDT</pubDate>
    </item>
    <item>
        <guid>nfl636381</guid>
        <title>Christian McCaffrey: Fully dressed for latest practice</title>
        <link>https://www.rotowire.com//football/player/christian-mccaffrey-11690</link>
        <description>McCaffrey (undisclosed) is in full uniform for the 49ers' practice session taking place Tuesday afternoon local time in Melbourne, Australia, Nick Wagoner of ESPN.com reports.

        Visit RotoWire.com for more analysis on this update.</description>
        <pubDate>Mon, 07 Sep 2026 9:00:00 PM PDT</pubDate>
    </item>
    <item>
        <guid>nfl636999</guid>
        <title>Nobody Onthisroster: Waived by team</title>
        <link>https://www.rotowire.com//football/player/nobody-onthisroster-99999</link>
        <description>Nobody was waived Monday.

        Visit RotoWire.com for more analysis on this update.</description>
        <pubDate>Mon, 07 Sep 2026 8:00:00 PM PDT</pubDate>
    </item>
  </channel>
</rss>`;

async function run() {
    let allPassed = true;
    const supabase = createClient();

    const automator = new BrownBellAutomator('test-league');
    automator.playersData = {
        '16683': { first_name: 'Christian', last_name: 'Gonzalez' },
        '11690': { first_name: 'Christian', last_name: 'McCaffrey' }
    };

    const items = automator.parseRotowireFeed(SAMPLE_XML);
    allPassed &= check('Parses all 3 items from the sample feed', items.length === 3);

    const gonzalez = items.find(i => i.rotowireGuid === 'nfl636384');
    allPassed &= check('Player name correctly split from the title prefix', gonzalez?.playerName === 'Christian Gonzalez');
    allPassed &= check('Headline correctly split from the title suffix', gonzalez?.headline === 'Inks extension with Patriots');
    allPassed &= check('RotoWire footer stripped from the snippet', !gonzalez?.snippet.includes('Visit RotoWire.com'));
    allPassed &= check('Snippet keeps the actual factual content', gonzalez?.snippet.startsWith('Gonzalez signed a four-year'));

    const nameIndex = automator.buildNormalizedNameIndex();
    for (const item of items) {
        item.sleeperPlayerId = nameIndex.get(automator.normalizePlayerName(item.playerName)) || null;
    }
    allPassed &= check('Gonzalez correctly matched to his Sleeper ID', items.find(i => i.rotowireGuid === 'nfl636384')?.sleeperPlayerId === '16683');
    allPassed &= check('McCaffrey correctly matched to his Sleeper ID', items.find(i => i.rotowireGuid === 'nfl636381')?.sleeperPlayerId === '11690');
    allPassed &= check('Unmatchable player name resolves to null rather than a wrong guess', items.find(i => i.rotowireGuid === 'nfl636999')?.sleeperPlayerId === null);

    automator.playersData['77777'] = { first_name: 'D.J.', last_name: 'Moore Jr.' };
    const reindexed = automator.buildNormalizedNameIndex();
    allPassed &= check('Period+suffix formatting differences still match correctly', reindexed.get(automator.normalizePlayerName('DJ Moore')) === '77777');

    await supabase.from('seasons').insert({ id: 's1', year: 2026 });
    await automator.dataLayer.loadSeason(2026, 'test-league');
    await automator.dataLayer.savePlayerNews(items);
    allPassed &= check('All 3 items saved, including the unmatched one', supabase._store.player_news.length === 3);

    const savedGonzalez = supabase._store.player_news.find(r => r.rotowire_guid === 'nfl636384');
    allPassed &= check('Saved row has the correct sleeper_player_id', savedGonzalez?.sleeper_player_id === '16683');
    const savedUnmatched = supabase._store.player_news.find(r => r.rotowire_guid === 'nfl636999');
    allPassed &= check('Saved unmatched row has sleeper_player_id null, not dropped', savedUnmatched && savedUnmatched.sleeper_player_id === null);

    await automator.dataLayer.savePlayerNews(items);
    allPassed &= check('Re-fetching the same items does not duplicate rows (upserted on guid)', supabase._store.player_news.length === 3);

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
