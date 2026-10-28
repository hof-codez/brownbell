// Run: node test-tc-trades.js
const assert = require('node:assert/strict');
const { parseTrades } = require('./tc-trades');

const ctx = {
    rosterOwner: new Map([[1, 'ownerA'], [2, 'ownerB'], [3, 'ownerC']]),
    ownerToTeam: new Map([['ownerA', 'team-a-uuid'], ['ownerB', 'team-b-uuid']]),
    validAssets: new Set(['p:100', 'p:200', 'p:300', 'pick:2027:1:2', 'pick:2028:2:1']),
};
const base = { type: 'trade', status: 'complete', status_updated: 1788000000000, waiver_budget: [], draft_picks: [] };

// roster 1 gets player 200 and a 2027 1st from roster 2. Roster 2 gets player 100.
const good = {
    ...base, transaction_id: 'tx-good', roster_ids: [1, 2],
    adds: { 100: 2, 200: 1 }, drops: { 100: 1, 200: 2 },
    draft_picks: [{ season: '2027', round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }],
};
let r = parseTrades([good], ctx);
assert.equal(r.length, 1);
assert.deepEqual(r[0].side_a.sort(), ['p:100']);                       // what roster 1 gave
assert.deepEqual(r[0].side_b.sort(), ['p:200', 'pick:2027:1:2']);        // what roster 2 gave
assert.equal(r[0].team_a, 'team-a-uuid');
assert.equal(r[0].team_b, 'team-b-uuid');
assert.equal(r[0].id, 'tx-good');

// skips: waivers/FAAB, three-team, untracked player, untracked pick year, wrong status, same asset twice
const skips = [
    { ...good, transaction_id: 'faab', waiver_budget: [{ sender: 1, receiver: 2, amount: 5 }] },
    { ...good, transaction_id: '3team', roster_ids: [1, 2, 3] },
    { ...good, transaction_id: 'unknown-player', adds: { 100: 2, 999: 1 } },
    { ...good, transaction_id: 'old-pick', draft_picks: [{ season: '2024', round: 1, roster_id: 2, previous_owner_id: 2, owner_id: 1 }] },
    { ...good, transaction_id: 'pending', status: 'pending' },
    { ...base, transaction_id: 'one-sided', roster_ids: [1, 2], adds: { 100: 2 } },
    { ...base, transaction_id: 'waiver-type', type: 'waiver', roster_ids: [1] },
];
assert.equal(parseTrades(skips, ctx).length, 0);

// owners who left the league map to an empty team id, so nobody is excluded wrongly
const left = parseTrades([{ ...good, transaction_id: 'old' }], { ...ctx, ownerToTeam: new Map([['ownerB', 'team-b-uuid']]) });
assert.equal(left[0].team_a, '');

// pick only trade
const pickTrade = {
    ...base, transaction_id: 'picks', roster_ids: [1, 2], adds: { 300: 1 },
    draft_picks: [{ season: '2028', round: 2, roster_id: 1, previous_owner_id: 1, owner_id: 2 }],
};
r = parseTrades([pickTrade], ctx);
assert.deepEqual(r[0].side_a, ['pick:2028:2:1']);   // roster 1 gave the pick
assert.deepEqual(r[0].side_b, ['p:300']);         // roster 2 gave the player
console.log('tc-trades tests passed');
