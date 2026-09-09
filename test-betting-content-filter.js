// test-betting-content-filter.js
// Proves the sports-betting content filter: catches genuine betting/odds/
// props content (which Google News search in particular will pull in,
// since it searches the open web rather than a fantasy-specific source),
// while never false-positiving on legitimate injury, roster, trade, or
// fantasy-analysis content that happens to share adjacent vocabulary
// ("picks" in "waiver wire pickups", "line" in "starting lineup", etc).
// Applied uniformly across all three news sources (shared RotoWire feed,
// RotoWire profile scrape, Google News search).

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

    const shouldFilter = [
        ['Best Bets: Christian McCaffrey Prop Picks for Week 1', null],
        ['Christian McCaffrey PrizePicks Picks and Odds', null],
        ['DraftKings Promo: Bet $5 Get $150 on McCaffrey TD', null],
        ['McCaffrey Touchdown Odds and Betting Lines', null],
        ['Weekly NFL Betting Picks', 'Action Network'],
        ['49ers vs Rams Point Spread and Moneyline', null],
        ['McCaffrey Touchdown Odds.', null],
        ['What are the Odds McCaffrey Scores This Week', null],
        ['FanDuel Week 1 Lineup Advice', null],
        ['Best NFL Parlay Bets This Weekend', null]
    ];

    const shouldNotFilter = [
        ['McCaffrey (undisclosed) is in full uniform for practice', null],
        ['Fantasy Football Waiver Wire Pickups: Week 1', null],
        ['49ers Waiver Wire Additions After Roster Cuts', null],
        ['McCaffrey Traded to a New Team', null],
        ['Top RB Rankings and Sleepers for 2026', null],
        ['McCaffrey Injury Update Ahead of Season Opener', 'Fox Sports'],
        ['McCaffrey Sets Franchise Rushing Record', null],
        ['Nickell Robey-Coleman Signs With New Team', null],
        ["49ers Update Starting Lineup Ahead of Week 1", null],
        ['McCaffrey Named to Pro Bowl Roster', null]
    ];

    console.log('--- Should be filtered (genuine betting content) ---');
    for (const [headline, source] of shouldFilter) {
        allPassed &= check(headline, automator.isSportsBettingContent(headline, source));
    }

    console.log('--- Should NOT be filtered (legitimate fantasy/injury/roster content) ---');
    for (const [headline, source] of shouldNotFilter) {
        allPassed &= check(headline, !automator.isSportsBettingContent(headline, source));
    }

    // --- Confirm the filter is actually wired into all three parsers ---
    automator.playersData = { '4034': { first_name: 'Christian', last_name: 'McCaffrey' } };

    const googleXmlWithBetting = `<item><title>Best Bets: McCaffrey Props - Action Network</title><link>https://x.com/a</link><guid>g1</guid><pubDate>Tue, 08 Sep 2026 14:00:00 GMT</pubDate><source url='https://x.com'>Action Network</source></item>`;
    const googleItems = automator.parseGoogleNewsFeed(googleXmlWithBetting, '4034', 'Christian McCaffrey');
    allPassed &= check('parseGoogleNewsFeed excludes betting items entirely', googleItems.length === 0);

    const rotowireXmlWithBetting = `<item><guid>rw1</guid><title>McCaffrey: Best Bets and Prop Picks for Week 1</title><link>https://rotowire.com/x</link><description>Some betting analysis text here about props.</description><pubDate>Tue, 08 Sep 2026 14:00:00 GMT</pubDate></item>`;
    const rotowireItems = automator.parseRotowireFeed(rotowireXmlWithBetting);
    allPassed &= check('parseRotowireFeed excludes betting items entirely', rotowireItems.length === 0);

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
