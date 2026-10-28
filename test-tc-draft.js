const test = require('node:test');
const assert = require('node:assert');
const { bucket, youngPairs, fitDraft, backtest } = require('./tc-draft');

test('buckets', () => {
    assert.strictEqual(bucket({ draftRound: 1, draftPick: 5 }), 'top12');
    assert.strictEqual(bucket({ draftRound: 1, draftPick: 25 }), 'early');
    assert.strictEqual(bucket({ draftRound: 3, draftPick: 80 }), 'mid');
    assert.strictEqual(bucket({ draftRound: 6, draftPick: 200 }), 'late');
    assert.strictEqual(bucket({}), 'udfa');
});

// world where early picks grow 6% a year and udfas shrink 3%, cohorts drafted 2015 to 2018
function world() {
    const players = new Map();
    const years = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023];
    const seasons = Object.fromEntries(years.map((y) => [y, []]));
    for (let i = 0; i < 160; i++) {
        const early = i % 2 === 0;
        const draftYear = 2015 + (i % 4);
        players.set(`p${i}`, { draftYear, draftRound: early ? 1 : null, draftPick: early ? 5 : null, birth: `${draftYear - 22}-06-01` });
        let ppg = 14;
        for (const y of years) {
            if (y < draftYear) continue;
            seasons[y].push({ pid: `p${i}`, pos: 'WR', games: 16, ppg });
            ppg *= early ? 1.06 : 0.97;
        }
    }
    return { players, seasons };
}

test('draft capital explains growth that age alone misses', () => {
    const { players, seasons } = world();
    const t = backtest(seasons, players, [2015, 2016, 2017, 2018, 2019, 2020], [2021, 2022]);
    assert.ok(t.plusDraftCapital < t.ageOnly, JSON.stringify(t));
});
