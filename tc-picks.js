// tc-picks.js
// Team-specific draft picks: one asset per original team, owned by whoever holds it in Sleeper,
// valued by where the original team is headed in the standings. Pure, no network.

const { CONFIG } = require('./tc-valuation');

const SPREAD = { 1: 0.30, 2: 0.18, 3: 0.10 };   // how far a first-slot or last-slot pick moves a round's value
const YEAR_WEIGHT = [1, 0.4, 0.2];               // next draft, then two years out: standings matter less
const FULL_CONFIDENCE_GAMES = 8;

const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

// standings: [{ rosterId, wins, losses, ties, pointsFor }]. Worst record picks first.
function projectedSlots(standings) {
    const rate = (s) => {
        const g = s.wins + s.losses + s.ties;
        return g ? (s.wins + s.ties / 2) / g : 0.5;
    };
    const sorted = [...standings].sort((a, b) => rate(a) - rate(b) || a.pointsFor - b.pointsFor);
    const slots = new Map();
    sorted.forEach((s, i) => slots.set(String(s.rosterId), i + 1));
    const gamesPlayed = Math.max(0, ...standings.map((s) => s.wins + s.losses + s.ties));
    return { slots, confidence: Math.min(1, gamesPlayed / FULL_CONFIDENCE_GAMES), size: standings.length };
}

// slot 1 = earliest pick. Returns a multiplier around 1.
function pickMult({ slot, size, round, yearsOut, confidence }) {
    const spread = SPREAD[round] ?? 0.06;
    const t = size > 1 ? (slot - 1) / (size - 1) : 0.5;
    const raw = 1 + spread * (1 - 2 * t);
    const w = confidence * (YEAR_WEIGHT[yearsOut - 1] ?? 0.1);
    return Math.round((1 + (raw - 1) * w) * 1000) / 1000;
}

// teams: [{ rosterId, name, teamId }]. tradedPicks: Sleeper /traded_picks.
function buildTeamPicks({ currentSeason, discount, teams, standings, tradedPicks, rounds = 3, yearsAhead = 3 }) {
    const { slots, confidence, size } = projectedSlots(standings);
    const teamByRoster = new Map(teams.map((t) => [String(t.rosterId), t]));
    const owner = new Map();
    for (const p of tradedPicks || []) owner.set(`${p.season}:${p.round}:${p.roster_id}`, String(p.owner_id));

    const assets = [];
    const holdings = [];
    for (let i = 1; i <= yearsAhead; i++) {
        const year = currentSeason + i;
        for (let round = 1; round <= rounds; round++) {
            const base = CONFIG.pickRoundBase[round] || 500;
            for (const t of teams) {
                const rid = String(t.rosterId);
                const id = `pick:${year}:${round}:${rid}`;
                assets.push({
                    id, kind: 'pick', name: `${year} ${ordinal(round)} (${t.name})`,
                    pick_year: year, pick_round: round,
                    seed_value: Math.round(base * Math.pow(discount, i - 1)),
                    pick_mult: slots.has(rid) ? pickMult({ slot: slots.get(rid), size, round, yearsOut: i, confidence }) : 1,
                });
                const holder = teamByRoster.get(owner.get(`${year}:${round}:${rid}`) || rid);
                if (holder) holdings.push({ asset_id: id, team_id: holder.teamId });
            }
        }
    }
    return { assets, holdings };
}

module.exports = { projectedSlots, pickMult, buildTeamPicks };
