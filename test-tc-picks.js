const test = require('node:test');
const assert = require('node:assert');
const { projectedSlots, pickMult, buildTeamPicks } = require('./tc-picks');

const st = (rosterId, wins, losses, pointsFor = 100) => ({ rosterId, wins, losses, ties: 0, pointsFor });

test('worst record gets the first slot, points break ties', () => {
    const { slots } = projectedSlots([st(1, 6, 2), st(2, 1, 7, 300), st(3, 1, 7, 200)]);
    assert.strictEqual(slots.get('3'), 1);
    assert.strictEqual(slots.get('2'), 2);
    assert.strictEqual(slots.get('1'), 3);
});

test('early season standings count for less', () => {
    assert.strictEqual(projectedSlots([st(1, 1, 0), st(2, 0, 1)]).confidence, 1 / 8);
    assert.strictEqual(projectedSlots([st(1, 8, 0), st(2, 0, 8)]).confidence, 1);
});

test('earlier slots are worth more, later rounds and later years move less', () => {
    const base = { size: 12, confidence: 1 };
    const first = pickMult({ ...base, slot: 1, round: 1, yearsOut: 1 });
    const last = pickMult({ ...base, slot: 12, round: 1, yearsOut: 1 });
    assert.ok(first > 1 && last < 1);
    assert.strictEqual(first, 1.3);
    assert.ok(pickMult({ ...base, slot: 1, round: 3, yearsOut: 1 }) < first);
    assert.ok(pickMult({ ...base, slot: 1, round: 1, yearsOut: 3 }) < first);
});

test('picks belong to the original team unless Sleeper says they were traded', () => {
    const teams = [{ rosterId: 1, name: 'A', teamId: 'ta' }, { rosterId: 2, name: 'B', teamId: 'tb' }];
    const { assets, holdings } = buildTeamPicks({
        currentSeason: 2026, discount: 0.92, teams,
        standings: [st(1, 4, 4), st(2, 2, 6)],
        tradedPicks: [{ season: '2027', round: 1, roster_id: 2, owner_id: 1 }],
    });
    assert.strictEqual(assets.length, 2 * 3 * 3);
    const owner = (id) => holdings.find((h) => h.asset_id === id).team_id;
    assert.strictEqual(owner('pick:2027:1:2'), 'ta');
    assert.strictEqual(owner('pick:2027:1:1'), 'ta');
    assert.strictEqual(owner('pick:2027:2:2'), 'tb');
    assert.ok(assets.find((a) => a.id === 'pick:2027:1:2').pick_mult > assets.find((a) => a.id === 'pick:2027:1:1').pick_mult);
});
