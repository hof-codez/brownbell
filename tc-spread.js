// tc-spread.js
// How far real outcomes land from the age-based projection. Pure, no network.
// For relevant players, compare what they scored k seasons later with cur x pooled drop x age ratio,
// and report the p10, p50 and p90 of actual / predicted by position, age band and horizon.
// A player who played fewer than 4 games that later season counts as a replacement-level season,
// so busts and retirements sit in the downside tail.

const { HAND, FROM } = require('./tc-curves');

const MIN_GAMES = 8;
const MIN_NEXT_GAMES = 4;
const REPLACEMENT = 4;
const RELEVANT_PPG = { QB: 12, RB: 8, WR: 8, TE: 6 };
const BANDS = [['young', 0, 23], ['prime', 24, 27], ['vet', 28, 99]];
const MIN_N = 40;

const handIndex = (pos, age) => {
    const v = HAND[pos];
    return v[Math.max(0, Math.min(v.length - 1, Math.floor(age) - FROM))];
};
const bandOf = (age) => BANDS.find(([, lo, hi]) => age >= lo && age <= hi)[0];

const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];

// rows: seasons[year] = [{ pid, pos, age, games, ppg }]
function spreadModel(seasons) {
    const years = Object.keys(seasons).map(Number).sort((a, b) => a - b);
    const out = {};
    for (const k of [1, 2, 3]) {
        const pairs = [];
        for (const y of years) {
            const now = seasons[y], later = seasons[y + k];
            if (!now || !later) continue;
            const nextBy = new Map(later.map((r) => [r.pid, r]));
            for (const r of now) {
                if (!RELEVANT_PPG[r.pos] || r.games < MIN_GAMES || r.ppg < RELEVANT_PPG[r.pos] || r.age < 21) continue;
                const n = nextBy.get(r.pid);
                pairs.push({ pos: r.pos, band: bandOf(r.age), age: r.age, cur: r.ppg, next: n && n.games >= MIN_NEXT_GAMES ? n.ppg : REPLACEMENT });
            }
        }
        const pooled = {};
        for (const p of pairs) { const t = (pooled[p.pos] ||= { cur: 0, next: 0 }); t.cur += p.cur; t.next += p.next; }
        const ratios = {};
        for (const p of pairs) {
            const pred = p.cur * (pooled[p.pos].next / pooled[p.pos].cur) * (handIndex(p.pos, p.age + k) / handIndex(p.pos, p.age));
            if (pred <= 0) continue;
            (ratios[`${p.pos}|${p.band}`] ||= []).push(p.next / pred);
            (ratios[`${p.pos}|all`] ||= []).push(p.next / pred);
        }
        out[k] = {};
        for (const [key, list] of Object.entries(ratios)) {
            if (list.length < MIN_N) continue;
            const s = list.sort((a, b) => a - b);
            const med = pct(s, 0.5);
            out[k][key] = {
                n: s.length,
                // spread around the middle outcome, as multipliers on the projection
                lo: Math.round((pct(s, 0.1) / med) * 100) / 100,
                hi: Math.round((pct(s, 0.9) / med) * 100) / 100,
            };
        }
    }
    return out;
}

module.exports = { spreadModel, bandOf, BANDS };
