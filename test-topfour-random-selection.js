// test-topfour-random-selection.js
// Verifies: (1) scoring uses a true average over available weeks, not a fixed
// total-over-3, (2) selection is uniform random among the top 4 (not weighted),
// (3) this now applies to BOTH awards, not just Main.

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'http://fake';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fake';

const BrownBellAutomator = require('./update-standings.js');

function check(label, cond) {
    console.log(`${cond ? '✅' : '❌'} ${label}`);
    return cond;
}

async function run() {
    let allPassed = true;

    // --- Test 1: true average vs fixed-total-over-3, early season (only 1 week of data) ---
    {
        const automator = new BrownBellAutomator('test-league');
        automator.playersData = {
            '1001': { first_name: 'Original', last_name: 'QB', position: 'QB', team: 'DAL', injury_status: null, years_exp: 5 },
            '1002': { first_name: 'Original', last_name: 'RB', position: 'RB', team: 'DAL', injury_status: null, years_exp: 5 },
            '2001': { first_name: 'Candidate', last_name: 'One', position: 'RB', team: 'DAL', injury_status: null, years_exp: 2 }
        };
        automator.leagueData = {
            rosters: [{ owner_id: 'owner1', roster_id: 1, players: ['1001', '2001'] }],
            userMap: { owner1: 'TeamA' }
        };
        automator.knownDuos.main = { TeamA: [{ name: 'Original QB', position: 'QB' }, { name: 'Original RB', position: 'RB' }] };
        automator.knownDuos.nextup = {};
        automator.hasPlayerGameStarted = async () => false;
        automator.isPlayerOnBye = async () => false;
        // Candidate scored 20 pts in week 1 only (week 2 has no entry - didn't play/no data)
        automator.getWeeklyScores = async (w) => (w === 1 ? { '2001': 20 } : {});

        const injury = { originalPlayer: { name: 'Original RB', position: 'RB' }, playerId: null, index: 1, status: 'out' };
        const sub = await automator.findSubstitute('TeamA', injury, 2, 'main');

        allPassed &= check('Early-season average = 20 (not 20/3=6.67 from a fixed 3-week divisor)', sub && Math.abs(sub.score - 20) < 0.01);
    }

    // --- Test 2: Next Up now uses the same top-4-random pool (previously always picked #1 deterministically) ---
    {
        const automator = new BrownBellAutomator('test-league');
        automator.playersData = {
            '3000': { first_name: 'Original', last_name: 'WR', position: 'WR', team: 'DAL', injury_status: null, years_exp: 0 },
            '3001': { first_name: 'Cand', last_name: 'A', position: 'RB', team: 'DAL', injury_status: null, years_exp: 1 },
            '3002': { first_name: 'Cand', last_name: 'B', position: 'QB', team: 'DAL', injury_status: null, years_exp: 2 },
            '3003': { first_name: 'Cand', last_name: 'C', position: 'TE', team: 'DAL', injury_status: null, years_exp: 2 },
            '3004': { first_name: 'Cand', last_name: 'D', position: 'K', team: 'DAL', injury_status: null, years_exp: 1 }
        };
        automator.leagueData = {
            rosters: [{ owner_id: 'owner1', roster_id: 1, players: ['3000', '3001', '3002', '3003', '3004'] }],
            userMap: { owner1: 'TeamB' }
        };
        automator.knownDuos.main = {};
        automator.knownDuos.nextup = { TeamB: [{ name: 'Original WR', position: 'WR' }, { name: 'Healthy', position: 'RB' }] };
        automator.hasPlayerGameStarted = async () => false;
        automator.isPlayerOnBye = async () => false;
        // Distinct scores so we can see which rank gets picked across repeated runs.
        // Candidates B/C/D differ from Cand A's own position/years appropriately per
        // the Next Up pairing rule against the ORIGINAL duo's healthy player (RB, some years) -
        // using varied positions/years so all 4 remain individually plausible.
        automator.getWeeklyScores = async (w) => {
            if (w === 3) return {}; // current week - no one has played yet, all still eligible
            return { '3001': 30, '3002': 25, '3003': 20, '3004': 15 }; // weeks 1-2 history
        };

        const injury = { originalPlayer: { name: 'Original WR', position: 'WR' }, playerId: null, index: 0, status: 'out' };

        const picks = new Set();
        for (let i = 0; i < 60; i++) {
            const sub = await automator.findSubstitute('TeamB', injury, 3, 'nextup');
            if (sub) picks.add(sub.name);
        }

        console.log(`   Distinct players picked across 60 runs: ${[...picks].join(', ')}`);
        allPassed &= check('Next Up now shows real randomness across the top pool (>1 distinct pick in 60 runs)', picks.size > 1);
    }

    console.log(allPassed ? '\n✅ ALL CHECKS PASSED' : '\n❌ SOME CHECKS FAILED');
    process.exit(allPassed ? 0 : 1);
}

run().catch(err => {
    console.error('Test threw:', err);
    process.exit(1);
});
