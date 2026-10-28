// tc-curves.js
// Fits age curves from past seasons and checks them against the hand-made ones. Pure, no network.
//
// A season row is { pid, pos, age, games, ppg }. A "cohort" player is one who mattered that
// season (enough games and points per game for his position). For each age we compare what the
// cohort scored that season with what the same players scored `k` seasons later. A player who
// played fewer than MIN_NEXT_GAMES that later season (injured, retired, cut) counts as a
// replacement-level season, so the curve includes the players who fell off the map.

const MIN_GAMES = 8;
const MIN_NEXT_GAMES = 4;
const REPLACEMENT = 4;
const RELEVANT_PPG = { QB: 12, RB: 8, WR: 8, TE: 6 };
const MIN_SAMPLE = 15;
const FROM = 21;
// Players picked for having a good season tend to score less the next year whatever their age.
// Values here are relative to the league, so that shared drop is not aging. Each position's
// year-over-year ratios are scaled so ages in its prime window show no change, and aging is
// read as the difference from there. The windows are an assumption, not something the data proves.
const PRIME_WINDOW = { QB: [26, 29], WR: [24, 27], TE: [25, 28], RB: [22, 24] };
const TO = 37;

// The curves currently in src/future.ts (index by age, starting at 21)
const HAND = {
    QB: [0.8, 0.85, 0.9, 0.95, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.9, 0.8, 0.65, 0.5, 0.35],
    RB: [0.9, 0.95, 1, 1, 0.97, 0.85, 0.7, 0.55, 0.4, 0.3, 0.2],
    WR: [0.85, 0.9, 0.95, 1, 1, 1, 1, 0.95, 0.88, 0.78, 0.65, 0.55, 0.4],
    TE: [0.75, 0.8, 0.85, 0.92, 0.97, 1, 1, 1, 1, 1, 0.9, 0.8, 0.65, 0.45],
};

const handIndex = (pos, age) => {
    const v = HAND[pos];
    return v[Math.max(0, Math.min(v.length - 1, Math.floor(age) - FROM))];
};

// seasons: { [year]: row[] }. Returns cohort pairs { pos, age, cur, next } for transitions of `k` years.
function pairs(seasons, k, years) {
    const out = [];
    for (const y of years) {
        const now = seasons[y];
        const later = seasons[y + k];
        if (!now || !later) continue;
        const nextBy = new Map(later.map((r) => [r.pid, r]));
        for (const r of now) {
            if (!RELEVANT_PPG[r.pos] || r.games < MIN_GAMES || r.ppg < RELEVANT_PPG[r.pos]) continue;
            const n = nextBy.get(r.pid);
            const next = n && n.games >= MIN_NEXT_GAMES ? n.ppg : REPLACEMENT;
            out.push({ pos: r.pos, age: Math.floor(r.age), cur: r.ppg, next });
        }
    }
    return out;
}

// Year over year ratio by age, then chained into an index that peaks at 1.
function fitCurve(pos, onePairs) {
    const byAge = new Map();
    for (const p of onePairs) {
        if (p.pos !== pos) continue;
        const a = byAge.get(p.age) || { n: 0, cur: 0, next: 0 };
        a.n += 1; a.cur += p.cur; a.next += p.next;
        byAge.set(p.age, a);
    }
    const ratios = [];
    const samples = [];
    for (let age = FROM; age < TO; age++) {
        const a = byAge.get(age);
        samples.push(a ? a.n : 0);
        ratios.push(a && a.n >= MIN_SAMPLE ? a.next / a.cur : null);
    }
    // fill thin ages with the nearest measured one, then smooth in log space
    const filled = ratios.map((r, i) => {
        if (r !== null) return r;
        for (let d = 1; d < ratios.length; d++) {
            if (ratios[i - d] != null) return ratios[i - d];
            if (ratios[i + d] != null) return ratios[i + d];
        }
        return 1;
    });
    // remove the shared drop: scale so the prime window averages out to no change
    const [lo, hi] = PRIME_WINDOW[pos] || [24, 27];
    const win = [];
    for (let age = lo; age <= hi; age++) {
        const r = ratios[age - FROM];
        if (r !== null && r !== undefined) win.push({ r, w: samples[age - FROM] });
    }
    const wsum = win.reduce((a, b) => a + b.w, 0);
    const shared = wsum ? Math.exp(win.reduce((a, b) => a + Math.log(b.r) * b.w, 0) / wsum) : 1;
    const adj = filled.map((r) => r / shared);
    const smooth = adj.map((_, i) => {
        const w = [0.25, 0.5, 0.25];
        let s = 0, t = 0;
        [-1, 0, 1].forEach((d, j) => {
            const v = adj[i + d];
            if (v === undefined) return;
            s += Math.log(v) * w[j]; t += w[j];
        });
        return Math.exp(s / t);
    });
    const idx = [1];
    for (let i = 0; i < smooth.length; i++) idx.push(idx[i] * smooth[i]);
    const peak = Math.max(...idx);
    return { v: idx.map((x) => Math.round((x / peak) * 100) / 100), sharedDrop: Math.round((1 - shared) * 1000) / 10, samples, ratios: ratios.map((r) => (r === null ? null : Math.round(r * 100) / 100)) };
}

// Compares predictions with what happened. Every model is scaled by the same pooled ratio per
// position, so the score reflects the age shape and not the shared drop described above.
function mae(testPairs, k, indexFn) {
    if (!testPairs.length) return null;
    const pooled = {};
    for (const p of testPairs) {
        const t = (pooled[p.pos] ||= { cur: 0, next: 0 });
        t.cur += p.cur; t.next += p.next;
    }
    let s = 0;
    for (const p of testPairs) {
        const m = pooled[p.pos].next / pooled[p.pos].cur;
        const pred = p.cur * m * (indexFn(p.pos, p.age + k) / indexFn(p.pos, p.age));
        s += Math.abs(pred - p.next);
    }
    return Math.round((s / testPairs.length) * 100) / 100;
}

// Fit on older seasons, test on the newest transitions.
function fitAndTest(seasons) {
    const years = Object.keys(seasons).map(Number).sort((a, b) => a - b);
    const last = years[years.length - 1];
    const testYears = [last - 2, last - 3].filter((y) => seasons[y]);       // transitions ending in the last two seasons
    const trainYears = years.filter((y) => y <= last - 4);                  // everything that does not touch test data
    const fitted = {};
    const trainOne = pairs(seasons, 1, trainYears);
    for (const pos of Object.keys(HAND)) fitted[pos] = fitCurve(pos, trainOne);
    const blended = Object.fromEntries(Object.keys(HAND).map((p) => [p, blend(p, fitted[p])]));
    const bfn = (pos, age) => blended[pos][Math.max(0, Math.min(blended[pos].length - 1, Math.floor(age) - FROM))];
    const fn = (pos, age) => fitted[pos].v[Math.max(0, Math.min(fitted[pos].v.length - 1, Math.floor(age) - FROM))];

    const report = {};
    for (const k of [1, 2]) {
        const test = pairs(seasons, k, k === 1 ? [last - 1, last - 2] : [last - 2, last - 3]).filter((p) => p.age >= FROM);
        report[`${k}yr`] = {
            n: test.length,
            hand: mae(test, k, handIndex),
            fitted: mae(test, k, fn),
            blended: mae(test, k, bfn),
            noChange: mae(test, k, () => 1),
        };
    }
    return { fitted, report, trainYears, testYears: [last - 1, last - 2] };
}

// Final fit on every season, for use.
function fitAll(seasons) {
    const years = Object.keys(seasons).map(Number).sort((a, b) => a - b);
    const one = pairs(seasons, 1, years);
    const out = {};
    for (const pos of Object.keys(HAND)) out[pos] = fitCurve(pos, one);
    return out;
}

// Blend of the hand-made curve and the fitted one. Where the data is thin the hand curve wins,
// and quarterbacks keep the hand curve because there are too few of them per age to trust.
const BLEND_CAP = { QB: 0, RB: 0.6, WR: 0.6, TE: 0.35 };
function blend(pos, fitted) {
    const hand = HAND[pos];
    const out = [];
    for (let i = 0; i <= TO - FROM; i++) {
        const h = hand[Math.min(hand.length - 1, i)];
        const f = fitted.v[i];
        const n = fitted.samples[Math.min(i, fitted.samples.length - 1)] || 0;
        const w = Math.min(BLEND_CAP[pos] ?? 0, n / 80);
        out.push(Math.round((h * (1 - w) + f * w) * 100) / 100);
    }
    return out;
}

module.exports = { blend, pairs, fitCurve, fitAndTest, fitAll, mae, HAND, FROM, TO };
