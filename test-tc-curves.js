const test = require('node:test');
const assert = require('node:assert');
const { pairs, fitCurve, fitAll } = require('./tc-curves');

// synthetic league: RBs score 15 from age 22 to 24, then lose 20% a year
function build(years) {
    const seasons = {};
    for (const y of years) {
        seasons[y] = [];
        for (let b = 1990; b < 2002; b++) {
            const age = y - b;
            if (age < 21 || age > 33) continue;
            for (let j = 0; j < 6; j++) {
                const decay = age <= 24 ? 1 : Math.pow(0.8, age - 24);
                seasons[y].push({ pid: `r${b}-${j}`, pos: 'RB', age, games: 16, ppg: 15 * decay + j * 0.01 });
            }
        }
    }
    return seasons;
}

test('a curve fitted to data that declines after 24 declines after 24', () => {
    const years = [];
    for (let y = 2012; y <= 2024; y++) years.push(y);
    const fitted = fitAll(build(years)).RB;
    const at = (age) => fitted.v[age - 21];
    assert.ok(at(24) > at(28), JSON.stringify(fitted.v));
    assert.ok(at(28) > at(31));
    assert.strictEqual(Math.max(...fitted.v), 1);
});

test('pairs only keep relevant players and count a vanished player as replacement level', () => {
    const seasons = {
        2020: [{ pid: 'a', pos: 'RB', age: 25, games: 16, ppg: 14 }, { pid: 'b', pos: 'RB', age: 25, games: 16, ppg: 3 }, { pid: 'c', pos: 'RB', age: 25, games: 3, ppg: 20 }],
        2021: [],
    };
    const p = pairs(seasons, 1, [2020]);
    assert.strictEqual(p.length, 1);
    assert.strictEqual(p[0].next, 4);
});
