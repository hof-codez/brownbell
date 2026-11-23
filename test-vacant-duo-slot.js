// A vacant Next Up duo slot (no name, no id) must not crash experience lookup.
const assert = require('assert');
const A = require('./update-standings.js');
const a = Object.create(A.prototype);
a.playersData = { 1: { first_name: 'A', last_name: 'B', years_exp: 1, position: 'WR' } };
assert.strictEqual(a.findPlayerInRoster({ name: null, sleeperId: null }, { players: ['1'] }), null);
assert.strictEqual(a.findPlayerInRoster(undefined, { players: ['1'] }), null);
assert.strictEqual(a.resolveNextUpExperience({ name: null }, { players: ['1'] }), null);
assert.strictEqual(a.resolveNextUpExperience(undefined, { players: ['1'] }), null);
assert.deepStrictEqual(a.resolveNextUpExperience({ name: 'A B' }, { players: ['1'] }), { years: 1, position: 'WR' });
console.log('vacant duo slot: ok');
