const test = require('node:test');
const assert = require('node:assert');
const { fitUsage, predictUsage, backtest } = require('./tc-usage');

// ppg = 1 + 1.5 targets + 0.6 carries, no noise
function rows(year) {
    const out = [];
    for (let i = 0; i < 80; i++) {
        const targets = 2 + (i % 9), carries = (i * 3) % 12;
        out.push({ pid: `p${i}`, pos: 'WR', games: 16, targets, carries, attempts: 0, ppg: 1 + 1.5 * targets + 0.6 * carries });
    }
    return out;
}

test('fits a clean relationship', () => {
    const m = fitUsage(rows(), 'WR');
    assert.ok(Math.abs(m.coef.targets - 1.5) < 0.01);
    assert.ok(Math.abs(m.coef.carries - 0.6) < 0.01);
    assert.ok(m.r2 > 0.99);
    assert.ok(Math.abs(predictUsage(m, { targets: 5, carries: 0 }) - 8.5) < 0.05);
});

test('backtest runs and a pure-usage world favors usage', () => {
    const seasons = { 2018: rows(), 2019: rows(), 2020: rows(), 2021: rows() };
    // this season's points carry luck; next season goes back to usage
    seasons[2020] = seasons[2020].map((r, i) => ({ ...r, ppg: r.ppg + (i % 2 ? 4 : -4) }));
    const t = backtest(seasons, [2018, 2019], [2020]);
    assert.ok(t.usageOnly < t.thisSeason);
});
