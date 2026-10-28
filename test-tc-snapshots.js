const test = require('node:test');
const assert = require('node:assert');
const { rosterBefore, ppgThrough, pickBasis } = require('./tc-snapshots');

test('walks transactions back to the moment before a trade', () => {
    const rosters = [{ roster_id: 1, players: ['a', 'x', 'new'] }, { roster_id: 2, players: ['b', 'y'] }];
    const trade = { type: 'trade', status: 'complete', status_updated: 100, adds: { x: 1, y: 2 }, drops: { x: 2, y: 1 } };
    // after the trade roster 1 picked up "new", then it traded nothing else
    const later = { type: 'free_agent', status: 'complete', status_updated: 200, adds: { new: 1 }, drops: { b: 2 } };
    const before = rosterBefore(rosters, [trade, later], trade, [1, 2]);
    assert.deepStrictEqual([...before[1]].sort(), ['a', 'y']);
    assert.deepStrictEqual([...before[2]].sort(), ['b', 'x']);
});

test('ignores transactions before the trade', () => {
    const rosters = [{ roster_id: 1, players: ['a'] }, { roster_id: 2, players: ['b'] }];
    const trade = { type: 'trade', status: 'complete', status_updated: 100, adds: { a: 1, b: 2 }, drops: { b: 1, a: 2 } };
    const earlier = { type: 'free_agent', status: 'complete', status_updated: 50, adds: { z: 1 }, drops: {} };
    const before = rosterBefore(rosters, [trade, earlier], trade, [1, 2]);
    assert.deepStrictEqual([...before[1]], ['b']);
});

test('ppg through a week and basis choice', () => {
    const weekly = { 1: { p: 10 }, 2: { p: 20 }, 3: {}, 4: { p: 6 } };
    assert.deepStrictEqual(ppgThrough(weekly, 'p', 3), { ppg: 15, games: 2 });
    assert.deepStrictEqual(ppgThrough(weekly, 'q', 4), { ppg: null, games: 0 });
    assert.strictEqual(pickBasis(8).basis, 'this');
    assert.strictEqual(pickBasis(8).through, 7);
    assert.strictEqual(pickBasis(2).basis, 'last');
    assert.strictEqual(pickBasis(undefined).basis, 'last');
});
