// test-rotowire-depth-chart-discovery.js
// Proves the depth-chart-based RotoWire URL discovery mechanism: extracts
// only genuine player profile links (matched to a known Sleeper player),
// correctly ignoring unrelated links on the same page.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const { createClient } = require('@supabase/supabase-js');
const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

const SIMULATED_DEPTH_CHART_HTML = `
<div>Quarterback QB</div>
<ul>
<li><a href="https://www.rotowire.com/football/player/trevor-lawrence-15357">Trevor Lawrence</a></li>
<li><a href="https://www.rotowire.com/football/player/quinn-ewers-18505">Quinn Ewers</a></li>
</ul>
<div>Wide Receiver WR</div>
<ul>
<li><a href="https://www.rotowire.com/football/player/brian-thomas-17716">Brian Thomas</a></li>
</ul>
<div><a href="https://www.rotowire.com/football/team/jacksonville-jaguars-jax">Jacksonville Jaguars</a></div>
<div><a href="https://www.rotowire.com/football/nfl-depth-charts/">All Depth Charts</a></div>
`;

async function run() {
    let allPassed = true;
    const supabase = createClient();

    const automator = new BrownBellAutomator('test-league');
    automator.playersData = {
        '15357': { first_name: 'Trevor', last_name: 'Lawrence', team: 'JAX' },
        '17716': { first_name: 'Brian', last_name: 'Thomas', team: 'JAX' }
    };

    const nameIndex = automator.buildNormalizedNameIndex();
    const links = automator.parseRotowireDepthChartLinks(SIMULATED_DEPTH_CHART_HTML, nameIndex);

    allPassed &= check('Extracts exactly the 2 matched players, not the unmatched one or nav links', links.length === 2);
    allPassed &= check('Lawrence correctly matched to his Sleeper ID', links.some(l => l.sleeperPlayerId === '15357'));
    allPassed &= check('Thomas correctly matched to his Sleeper ID', links.some(l => l.sleeperPlayerId === '17716'));
    allPassed &= check('URL is the exact real profile link, not a guessed/synthesized one', links.find(l => l.sleeperPlayerId === '15357')?.rotowireUrl === 'https://www.rotowire.com/football/player/trevor-lawrence-15357');

    await supabase.from('seasons').insert({ id: 's1', year: 2026 });
    await supabase.from('teams').insert({ id: 't1', season_id: 's1', display_name: 'TeamA' });
    await automator.dataLayer.loadSeason(2026, 'test-league');

    automator.knownDuos = {
        main: { TeamA: [{ sleeperId: '15357' }, { sleeperId: '17716' }] },
        nextup: {},
        boom: {}
    };
    automator.fetchText = async (url) => {
        allPassed &= check('Fetches the correct Jacksonville depth chart URL', url === 'https://www.rotowire.com/football/nfl-depth-charts/jacksonville-jaguars-depth-chart-jax');
        return SIMULATED_DEPTH_CHART_HTML;
    };

    await automator.fetchAndSaveDepthChartLinks();
    const savedLinks = await automator.dataLayer.getRotowirePlayerLinks(['15357', '17716']);
    allPassed &= check('Both players from the relevant team are saved after a full run', savedLinks.length === 2);

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
