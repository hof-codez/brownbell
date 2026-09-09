// test-rotowire-profile-scraping.js
// Proves the per-player RotoWire profile page scraper: extracts dated
// news entries anchored on the "Month D, YYYY" pattern, correctly stops
// before RotoWire's paywalled "ANALYSIS" commentary, rejects unrelated
// dated content elsewhere on the page that doesn't actually mention the
// player, and produces a stable dedup key across repeated parses of the
// same page (so re-fetching never duplicates an already-seen entry).

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const { createClient } = require('@supabase/supabase-js');
const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

const SIMULATED_PROFILE_HTML = `
<div class='news-item'>
<img src='sf.svg' alt='SF'>
<h3>Fully dressed for latest practice</h3>
<span><b>RB</b>San Francisco 49ers</span>
<span>Undisclosed</span>
<span>September 7, 2026</span>
<p>McCaffrey (undisclosed) is in full uniform for the 49ers' practice session taking place Tuesday afternoon local time in Melbourne, Australia, <a href='x'>Nick Wagoner of ESPN.com</a> reports.</p>
<p><b>ANALYSIS</b><br>McCaffrey wasn't spotted taking part in the early portion of practice Monday, so his presence on the field in full uniform Tuesday is a promising sign.</p>
</div>
<div class='news-item'>
<img src='sf.svg' alt='SF'>
<h3>Sitting out early drills Monday</h3>
<span><b>RB</b>San Francisco 49ers</span>
<span>Undisclosed</span>
<span>September 6, 2026</span>
<p>McCaffrey (undisclosed) wasn't participating in drills in the early portion of the 49ers' practice early Monday in Australia, <a href='x'>Matt Maiocco of NBC Sports Bay Area</a> reports.</p>
<p><b>ANALYSIS</b><br><a href='x'>Subscribe now</a> to instantly reveal our take on this news.</p>
</div>
<div>Some unrelated article published August 30, 2026 about quarterback rankings, nothing to do with running backs.</div>
`;

async function run() {
    let allPassed = true;
    const supabase = createClient();

    const automator = new BrownBellAutomator('test-league');
    automator.playersData = { '11690': { first_name: 'Christian', last_name: 'McCaffrey' } };

    const items = automator.parseRotowireProfilePage(
        SIMULATED_PROFILE_HTML, '11690', 'McCaffrey', 'https://www.rotowire.com/football/player/christian-mccaffrey-11690'
    );

    allPassed &= check('Extracts both real entries, rejecting the unrelated dated content', items.length === 2);
    allPassed &= check('First entry has the correct date', items.some(i => i.publishedAt.toDateString().includes('Sep 07 2026')));
    allPassed &= check('Second entry has the correct date', items.some(i => i.publishedAt.toDateString().includes('Sep 06 2026')));
    allPassed &= check('Snippet stops before the paywalled ANALYSIS commentary', items.every(i => !i.snippet.includes('ANALYSIS') && !i.snippet.includes('promising sign') && !i.snippet.includes('Subscribe now')));
    allPassed &= check('Snippet keeps the actual factual reporting', items.some(i => i.snippet.includes('full uniform')));
    allPassed &= check('sourceUrl is the actual profile page passed in, not a placeholder', items.every(i => i.sourceUrl === 'https://www.rotowire.com/football/player/christian-mccaffrey-11690'));

    const itemsAgain = automator.parseRotowireProfilePage(
        SIMULATED_PROFILE_HTML, '11690', 'McCaffrey', 'https://www.rotowire.com/football/player/christian-mccaffrey-11690'
    );
    const guidsMatch = items.every(i => itemsAgain.some(j => j.rotowireGuid === i.rotowireGuid));
    allPassed &= check('Dedup key is stable across repeated parses of the same page (re-fetch never duplicates)', guidsMatch);

    await supabase.from('seasons').insert({ id: 's1', year: 2026 });
    await automator.dataLayer.loadSeason(2026, 'test-league');
    await automator.dataLayer.savePlayerNews(items);
    await automator.dataLayer.savePlayerNews(itemsAgain);
    allPassed &= check('Saving the same re-parsed items twice does not create duplicate rows', supabase._store.player_news.length === 2);

    await automator.dataLayer.saveRotowirePlayerLinks([{ sleeperPlayerId: '11690', rotowireUrl: 'https://www.rotowire.com/football/player/christian-mccaffrey-11690' }]);
    const links = await automator.dataLayer.getRotowirePlayerLinks(['11690']);
    allPassed &= check('Learned link is retrievable', links.length === 1 && links[0].rotowireUrl.includes('mccaffrey'));

    await automator.dataLayer.saveRotowirePlayerLinks([{ sleeperPlayerId: '11690', rotowireUrl: 'https://www.rotowire.com/some-different-url' }]);
    const linksAgain = await automator.dataLayer.getRotowirePlayerLinks(['11690']);
    allPassed &= check('Existing mapping is never overwritten once learned', linksAgain.length === 1 && linksAgain[0].rotowireUrl.includes('mccaffrey'));

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
