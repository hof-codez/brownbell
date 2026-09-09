// test-prune-disqualified-news.js
// Proves the retroactive cleanup for a real reported issue: 6223+ Google
// News items were saved in a single run before the betting-content and
// title-match filters existed. Those filters only affect NEW saves going
// forward - without this prune step, all that stale, now-disqualified
// output (Kalshi promo articles, roundup pieces that never name the
// player, etc.) would sit in the table forever, since rows are only ever
// upserted, never re-evaluated.

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
    automator.playersData = {
        '4034': { first_name: 'Christian', last_name: 'McCaffrey' },
        '11631': { first_name: 'Brian', last_name: 'Thomas' }
    };

    // Modeled directly on the real reported examples: a Kalshi promo
    // article and a roundup piece, both saved before either filter
    // existed, alongside genuinely valid items and a RotoWire item
    // (which the title-match check must never apply to).
    await supabase.from('player_news').insert([
        { id: 'n1', rotowire_guid: 'google-4034-a', headline: "Kalshi promo code NYPMAX: Trade $25, get $25 for Thursday Night Football", source_name: 'New York Post', sleeper_player_id: '4034', player_name: 'Christian McCaffrey' },
        { id: 'n2', rotowire_guid: 'google-4034-b', headline: "Newsday's 2026 NFL season preview: Jets, Giants, the Super Bowl and more", source_name: 'Newsday', sleeper_player_id: '4034', player_name: 'Christian McCaffrey' },
        { id: 'n3', rotowire_guid: 'google-4034-c', headline: 'Christian McCaffrey ready to go Week 1', source_name: 'The New York Times', sleeper_player_id: '4034', player_name: 'Christian McCaffrey' },
        { id: 'n4', rotowire_guid: 'rw12345', headline: 'is in full uniform for practice', source_name: null, sleeper_player_id: '11631', player_name: 'Brian Thomas' }
    ]);

    await automator.pruneDisqualifiedNews();

    const remaining = supabase._store.player_news.map(r => r.id).sort();
    allPassed &= check('Kalshi promo article (betting-adjacent) is pruned', !remaining.includes('n1'));
    allPassed &= check('Roundup article never naming McCaffrey in the title is pruned', !remaining.includes('n2'));
    allPassed &= check('Genuine, currently-compliant item is kept', remaining.includes('n3'));
    allPassed &= check('RotoWire-sourced item is never subject to the title-match check', remaining.includes('n4'));
    allPassed &= check('Exactly 2 items were pruned, not more or fewer', remaining.length === 2);

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
