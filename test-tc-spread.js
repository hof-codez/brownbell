const test = require('node:test');
const assert = require('node:assert');
const { spreadModel, bandOf } = require('./tc-spread');

test('bands', () => {
    assert.strictEqual(bandOf(22), 'young');
    assert.strictEqual(bandOf(25), 'prime');
    assert.strictEqual(bandOf(30), 'vet');
});

test('noisy outcomes give a wider range than steady ones', () => {
    const mk = (noise) => {
        const s = { 2018: [], 2019: [] };
        for (let i = 0; i < 300; i++) {
            const cur = 12 + (i % 5);
            s[2018].push({ pid: `p${i}`, pos: 'WR', age: 25, games: 16, ppg: cur });
            s[2019].push({ pid: `p${i}`, pos: 'WR', age: 26, games: 16, ppg: cur * (1 + noise * (((i * 37) % 100) / 100 - 0.5)) });
        }
        return spreadModel(s)[1]['WR|prime'];
    };
    const calm = mk(0.1), wild = mk(0.8);
    assert.ok(wild.hi - wild.lo > calm.hi - calm.lo);
    assert.ok(wild.lo < 1 && wild.hi > 1);
});
