// tc-usage.js
// Usage-implied scoring: what a player's touches say he should score per game, so we can tell
// who is scoring above or below his opportunity. Pure, no network.
//
// A row is { pid, pos, games, ppg, targets, carries, attempts } with per-game numbers.

const FEATURES = { QB: ['attempts', 'carries'], RB: ['targets', 'carries'], WR: ['targets', 'carries'], TE: ['targets', 'carries'] };
const MIN_GAMES = 8;
const MIN_NEXT_GAMES = 4;
const RELEVANT_PPG = { QB: 12, RB: 8, WR: 8, TE: 6 };

// Solves A x = b by Gaussian elimination
function solve(A, b) {
    const n = b.length;
    const M = A.map((r, i) => [...r, b[i]]);
    for (let i = 0; i < n; i++) {
        let p = i;
        for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
        [M[i], M[p]] = [M[p], M[i]];
        if (Math.abs(M[i][i]) < 1e-9) return null;
        for (let r = i + 1; r < n; r++) {
            const f = M[r][i] / M[i][i];
            for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
        }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        let s = M[i][n];
        for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c];
        x[i] = s / M[i][i];
    }
    return x;
}

// Least squares ppg ~ intercept + features, weighted by games played. Returns { b0, coef, n, r2 }.
function fitUsage(rows, pos) {
    const feats = FEATURES[pos];
    const data = rows.filter((r) => r.pos === pos && r.games >= MIN_GAMES);
    if (data.length < 30) return null;
    const k = feats.length + 1;
    const A = Array.from({ length: k }, () => new Array(k).fill(0));
    const b = new Array(k).fill(0);
    for (const r of data) {
        const x = [1, ...feats.map((f) => r[f] || 0)];
        const w = r.games;
        for (let i = 0; i < k; i++) {
            b[i] += w * x[i] * r.ppg;
            for (let j = 0; j < k; j++) A[i][j] += w * x[i] * x[j];
        }
    }
    const beta = solve(A, b);
    if (!beta) return null;
    const model = { b0: beta[0], coef: Object.fromEntries(feats.map((f, i) => [f, beta[i + 1]])), n: data.length };
    const mean = data.reduce((s, r) => s + r.ppg, 0) / data.length;
    let ssr = 0, sst = 0;
    for (const r of data) { ssr += (r.ppg - predictUsage(model, r)) ** 2; sst += (r.ppg - mean) ** 2; }
    model.r2 = sst ? Math.round((1 - ssr / sst) * 1000) / 1000 : 0;
    return model;
}

function predictUsage(model, row) {
    let y = model.b0;
    for (const [f, c] of Object.entries(model.coef)) y += c * (row[f] || 0);
    return y;
}

// Does the usage-implied number predict next season better than this season's points do?
function backtest(seasons, fitYears, testYears) {
    const train = fitYears.flatMap((y) => seasons[y] || []);
    const models = {};
    for (const pos of Object.keys(FEATURES)) models[pos] = fitUsage(train, pos);

    let n = 0, eCur = 0, eUse = 0, eMix = 0;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const y of testYears) {
        const now = seasons[y], later = seasons[y + 1];
        if (!now || !later) continue;
        const nextBy = new Map(later.map((r) => [r.pid, r]));
        for (const r of now) {
            const m = models[r.pos];
            if (!m || r.games < MIN_GAMES || r.ppg < RELEVANT_PPG[r.pos]) continue;
            const nx = nextBy.get(r.pid);
            if (!nx || nx.games < MIN_NEXT_GAMES) continue;
            const u = predictUsage(m, r);
            n += 1;
            eCur += Math.abs(r.ppg - nx.ppg);
            eUse += Math.abs(u - nx.ppg);
            eMix += Math.abs((r.ppg + u) / 2 - nx.ppg);
            const gap = r.ppg - u, change = nx.ppg - r.ppg;
            sx += gap; sy += change; sxx += gap * gap; sxy += gap * change;
        }
    }
    const round = (v) => Math.round(v * 100) / 100;
    const slope = n > 2 && sxx - (sx * sx) / n !== 0 ? (sxy - (sx * sy) / n) / (sxx - (sx * sx) / n) : null;
    return {
        n,
        thisSeason: n ? round(eCur / n) : null,
        usageOnly: n ? round(eUse / n) : null,
        halfAndHalf: n ? round(eMix / n) : null,
        // change in points next year per point of "scored above usage" this year; negative means it fades
        gapSlope: slope === null ? null : round(slope),
    };
}

module.exports = { fitUsage, predictUsage, backtest, FEATURES, MIN_GAMES };
