import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOffer, signOffer, verifyOffer } from './offer.ts';

const pool = Array.from({ length: 120 }, (_, i) => ({ id: 'a' + i, rating: 300 + i * 80, votes: i % 6 }));
const adj = (r: number, s: number) => 10000 * Math.pow(r / 10000, 1 + s);

test('offers are balanced, distinct and well formed', () => {
  const byId = new Map(pool.map((a) => [a.id, a]));
  const sizes = new Set<string>();
  for (let n = 0; n < 500; n++) {
    const o = buildOffer(pool, 0.3);
    assert.ok(o, 'an offer is produced');
    const ids = [...o.receive, ...o.give];
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(o.receive.length <= 3 && o.give.length <= 3);
    assert.ok(o.receive.length === 1 || o.give.length === 1, 'one side is a single asset');
    const sr = o.receive.reduce((s, id) => s + adj(byId.get(id)!.rating, 0.3), 0);
    const sg = o.give.reduce((s, id) => s + adj(byId.get(id)!.rating, 0.3), 0);
    assert.ok(Math.abs(sr - sg) / Math.max(sr, sg) <= 0.3, 'sides are close in value');
    sizes.add(`${o.receive.length}-${o.give.length}`);
  }
  assert.ok(sizes.size >= 4, 'a mix of shapes: ' + [...sizes].join(' '));
});

test('tiny pools give no offer', () => {
  assert.equal(buildOffer(pool.slice(0, 3), 0.3), null);
});

test('signature accepts the real offer and rejects tampering', async () => {
  const o = { receive: ['a1'], give: ['a2', 'a3'] };
  const { exp, sig } = await signOffer('secret', 'team1', o);
  assert.ok(await verifyOffer('secret', 'team1', o, exp, sig));
  assert.ok(await verifyOffer('secret', 'team1', { receive: ['a1'], give: ['a3', 'a2'] }, exp, sig), 'order does not matter');
  assert.ok(!(await verifyOffer('secret', 'team1', { receive: ['a9'], give: ['a2', 'a3'] }, exp, sig)));
  assert.ok(!(await verifyOffer('secret', 'team2', o, exp, sig)), 'wrong voter');
  assert.ok(!(await verifyOffer('other', 'team1', o, exp, sig)), 'wrong secret');
  assert.ok(!(await verifyOffer('secret', 'team1', o, exp - 7 * 3600_000, sig)), 'expired');
});
