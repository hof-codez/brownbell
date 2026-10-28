import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arizonaDayStart, buildProfile, type TraitRow } from './profile.ts';

const row = (grp: string, n: number, resid: number): TraitRow => ({ team_id: 't', grp, n, resid });

test('under 10 votes shows nothing', () => {
  const p = buildProfile([row('_votes', 9, 0), row('pick', 9, 9)]);
  assert.equal(p.confidence, 'none');
  assert.deepEqual(p.traits, []);
});

test('10 votes is an early read, 25 is solid', () => {
  assert.equal(buildProfile([row('_votes', 10, 0)]).confidence, 'early');
  assert.equal(buildProfile([row('_votes', 25, 0)]).confidence, 'solid');
});

test('pick lover and vet fader are detected', () => {
  const p = buildProfile([row('_votes', 12, 0), row('pick', 12, 12), row('young', 12, -6), row('vet', 12, 10)]);
  const keys = p.traits.map((t) => t.key);
  assert.ok(keys.includes('pick-lover'));
  assert.ok(keys.includes('vets'));
  assert.ok(!keys.includes('youth'));
});

test('small samples are pulled toward zero', () => {
  const small = buildProfile([row('_votes', 10, 0), row('pick', 5, 5)]);
  const big = buildProfile([row('_votes', 10, 0), row('pick', 50, 50)]);
  assert.ok(small.lean.pick < big.lean.pick);
});

test('groups seen fewer than 6 times produce no position trait', () => {
  const p = buildProfile([row('_votes', 10, 0), row('QB', 4, 4)]);
  assert.ok(!p.traits.some((t) => t.key === 'likes-QB'));
});

test('follows the league vs contrarian', () => {
  assert.ok(buildProfile([row('_votes', 10, 6)]).traits.some((t) => t.key === 'consensus'));
  assert.ok(buildProfile([row('_votes', 20, 0)]).traits.some((t) => t.key === 'contrarian'));
});

test('arizona day starts at 07:00 UTC', () => {
  assert.equal(arizonaDayStart(new Date('2026-10-27T20:00:00Z')).toISOString(), '2026-10-27T07:00:00.000Z');
  assert.equal(arizonaDayStart(new Date('2026-10-27T03:00:00Z')).toISOString(), '2026-10-26T07:00:00.000Z');
});
