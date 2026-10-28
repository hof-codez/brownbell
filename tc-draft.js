// tc-draft.js
// Does draft capital and experience improve next-season projections for young players?
// Pure, no network. Rows are nflverse season rows { pid, pos, games, ppg } by season, plus a
// players map pid -> { draftYear, draftRound, draftPick, birth }.

const { HAND, FROM } = require('./tc-curves');

const MIN_GAMES = 8;
const MIN_NEXT_GAMES = 4;
const REPLACEMENT = 4;
const RELEVANT_PPG = { QB: 12, RB: 8, WR: 8, TE: 6 };
const MAX_EXP = 3;          // years since the draft that the draft effect is measured over
const SHRINK = 30;          // pulls small buckets toward no effect

const BUCKETS = ['top12', 'early', 'mid', 'late', 'udfa'];

function bucket(p) {
    if (!p || !p.draftRound) return 'udfa';
    if (p.draftRound === 1 && p.draftPick && p.draftPick <= 12) return 'top12';
    if (p.draftRound <= 2) return 'early';
    if (p.draftRound <= 4) return 'mid';
    return 'late';
}

const handIndex = (pos, age) => {
    const v = HAND[pos];
    return v[Math.max(0, Math.min(v.length - 1, Math.floor(age) - FROM))];
};

// Cohort pairs for young players: pos, age, exp (seasons since the draft), bucket, cur, next
function youngPairs(seasons, players, years) {
    const out = [];
    for (const y of years) {
        const now = seasons[y], later = seasons[y + 1];
        if (!now || !later) continue;
        const nextBy = new Map(later.map((r) => [r.pid, r]));
        for (const r of now) {
            const p = players.get(r.pid);
            if (!p || !p.birth || !RELEVANT_PPG[r.pos] || r.games < MIN_GAMES || r.ppg < RELEVANT_PPG[r.pos]) continue;
            const exp = p.draftYear ? y - p.draftYear : null;
            if (exp === null || exp < 0 || exp > MAX_EXP) continue;
            const age = (Date.UTC(y, 8, 1) - Date.parse(p.birth)) / (365.25 * 86400_000);
            if (!Number.isFinite(age)) continue;
            const n = nextBy.get(r.pid);
            out.push({ pos: r.pos, age: Math.floor(age), exp, bucket: bucket(p), cur: r.ppg, next: n && n.games >= MIN_NEXT_GAMES ? n.ppg : REPLACEMENT });
        }
    }
    return out;
}

// Pooled one-year ratio per position (the shared drop), then each player's residual ratio after the
// hand-made age index. Returns multipliers by experience year, and by experience year and bucket.
function fitDraft(pairs) {
    const pooled = {};
    for (const p of pairs) { const t = (pooled[p.pos] ||= { cur: 0, next: 0 }); t.cur += p.cur; t.next += p.next; }
    const base = (p) => (pooled[p.pos].next / pooled[p.pos].cur) * (handIndex(p.pos, p.age + 1) / handIndex(p.pos, p.age));
    const cells = {};
    const add = (key, p) => {
        const c = (cells[key] ||= { n: 0, actual: 0, expected: 0 });
        c.n += 1; c.actual += p.next; c.expected += p.cur * base(p);
    };
    for (const p of pairs) { add(`exp${p.exp}`, p); add(`exp${p.exp}|${p.bucket}`, p); }
    const mult = {};
    for (const [k, c] of Object.entries(cells)) {
        const raw = c.expected ? c.actual / c.expected : 1;
        mult[k] = { n: c.n, raw: Math.round(raw * 1000) / 1000, m: Math.round((1 + (raw - 1) * (c.n / (c.n + SHRINK))) * 1000) / 1000 };
    }
    return { pooled: Object.fromEntries(Object.entries(pooled).map(([k, t]) => [k, t.next / t.cur])), mult };
}

function predict(model, p, withExp, withBucket) {
    const pooled = model.pooled[p.pos] ?? 1;
    let r = pooled * (handIndex(p.pos, p.age + 1) / handIndex(p.pos, p.age));
    if (withExp) r *= model.mult[`exp${p.exp}`]?.m ?? 1;
    if (withBucket) r *= model.mult[`exp${p.exp}|${p.bucket}`]?.m ?? 1;
    return p.cur * r;
}

function backtest(seasons, players, trainYears, testYears) {
    const model = fitDraft(youngPairs(seasons, players, trainYears));
    const test = youngPairs(seasons, players, testYears);
    const err = (fn) => (test.length ? Math.round((test.reduce((s, p) => s + Math.abs(fn(p) - p.next), 0) / test.length) * 100) / 100 : null);
    return {
        n: test.length,
        ageOnly: err((p) => predict(model, p, false, false)),
        plusExperience: err((p) => predict(model, p, true, false)),
        plusDraftCapital: err((p) => predict(model, p, true, true)),
    };
}

module.exports = { bucket, youngPairs, fitDraft, backtest, BUCKETS, MAX_EXP };
