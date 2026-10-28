const test = require('node:test');
const assert = require('node:assert');
const { pairs, fitCurve, fitAll } = require('./tc-curves');

// synthetic league: every RB scores 15 at 22-24, then falls 20% a year
function season(year, ageOffset) {
    const rows = [];
    for (let i = 0; i < 400; i++) {
        const age = 21 + (i % 12);
        const born = year - age;
        const decay = age <= 24 ? 1 : Math.pow(0.8, age - 24);
        rows.push({ pid: `r${born}-${i}`, pos: 'RB', age, games: 16, ppg: 15 * decay + 0.0001 * i });
    }
    return rows;
}

test('pairs only keep relevant players and count a vanished player as replacement level', () => {
    const seasons = {
        2020: [{ pid: 'a', pos: 'RB', age: 25, games: 16, ppg: 14 }, { pid: 'b', pos: 'RB', age: 25, games: 16, ppg: 3 }, { pid: 'c', pos: 'RB', age: 25, games: 3, ppg: 20 }],
        2021: [],
    };
    const p = pairs(seasons, 1, [2020]);
    assert.strictEqual(p.length, 1);
    assert.strictEqual(p[0].next, 4);
});

test('a curve fitted to data that declines after 24 declines after 24', () => {
    // same players across years: id encodes birth year
    const seasons = {};
    for (const y of [2016, 2017, 2018, 2019, 2020, 2021, 2022]) seasons[y] = season(y).map((r) => ({ ...r }));
    // make ids stable so players appear in the next season at age+1
    for (const y of Object.keys(seasons)) {
        seasons[y] = seasons[y].map((r, i) => ({ ...r, pid: `p${Number(y) - r.age}-${i % 12}-${Math.floor(i / 12)}` }));
    }
    const fitted = fitAll(seasons).RB;
    const at = (age) => fitted.v[age - 21];
    assert.ok(at(24) >= at(30));
    assert.strictEqual(Math.max(...fitted.v), 1);
});
