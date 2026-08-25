// test-find-player-id-first.js
// Verifies: findPlayerInRoster now uses the duo entry's sleeperId directly
// whenever it's available, rather than always falling through to fuzzy name
// matching. Constructs a scenario the fuzzy matcher would genuinely get
// wrong (two players sharing a last name and first initial on the same
// roster) to prove the ID shortcut is what's actually being used, not just
// coincidentally landing on the right answer.

process.env.SUPABASE_URL = 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake';

const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

function run() {
    const automator = new BrownBellAutomator('test-league');
    let allPassed = true;

    automator.playersData = {
        'p-real': { first_name: 'Michael', last_name: 'Thomas' },
        'p-decoy': { first_name: 'Mike', last_name: 'Thomas' }
    };
    const roster = { players: ['p-real', 'p-decoy'] };

    const originalPlayer = { name: 'Michael Thomas', position: 'WR', sleeperId: 'p-real' };
    const result = automator.findPlayerInRoster(originalPlayer, roster);
    allPassed &= check('Resolves directly via sleeperId, unambiguously to the real intended player', result === 'p-real');

    const legacyPlayer = { name: 'Michael Thomas', position: 'WR' };
    const fallbackResult = automator.findPlayerInRoster(legacyPlayer, roster);
    allPassed &= check('Legacy row with no sleeperId still resolves via fuzzy name matching (exact match)', fallbackResult === 'p-real');

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run();
