// tc-valuation.js
// Outside-value starting points for the trade calculator. League votes move the
// ratings away from these. Everything here is a starting guess, not the answer.
// Scale: 0 to 10000, the best asset sits near 10000.

const CONFIG = {
    superflex: false,           // this league: 1 QB, no superflex. true raises QB value
    qbWeightNonSuperflex: 0.7,
    curve: 1.6,                 // steepness: higher makes stars worth far more than depth
    priorSeasonWeight: 0.6,     // last season counts this much per game vs this season
    noStatsFloor: 350,          // players with no games at all
    pickRoundBase: { 1: 5000, 2: 2400, 3: 1000 },
};

// Age curves: [maxAge, factor]. First row whose maxAge >= age wins.
const AGE_CURVE = {
    QB: [[22, 1.12], [25, 1.08], [29, 1.0], [33, 0.95], [35, 0.8], [37, 0.6], [99, 0.4]],
    RB: [[21, 1.15], [23, 1.12], [25, 1.0], [26, 0.85], [27, 0.7], [28, 0.55], [29, 0.4], [99, 0.25]],
    WR: [[21, 1.15], [23, 1.1], [27, 1.0], [29, 0.9], [30, 0.78], [32, 0.6], [99, 0.4]],
    TE: [[22, 1.12], [24, 1.08], [29, 1.0], [31, 0.85], [33, 0.65], [99, 0.4]],
};

function ageFactor(position, age) {
    if (!age) return 1;
    const rows = AGE_CURVE[position] || AGE_CURVE.WR;
    for (const [maxAge, f] of rows) if (age <= maxAge) return f;
    return 0.4;
}

// stats: { [playerId]: { games, points } } for each season
function blendedPpg(now, prev) {
    const gNow = now?.games || 0;
    const gPrev = prev?.games || 0;
    const w = CONFIG.priorSeasonWeight;
    const denom = gNow + gPrev * w;
    if (denom === 0) return null;
    return ((now?.points || 0) + (prev?.points || 0) * w) / denom;
}

// players: [{ id, name, position, team, age }]
// returns same list with seed_value added
function valuePlayers(players, statsNow, statsPrev) {
    const scored = players.map((p) => {
        const ppg = blendedPpg(statsNow[p.id], statsPrev[p.id]);
        const posWeight = p.position === 'QB' && !CONFIG.superflex ? CONFIG.qbWeightNonSuperflex : 1;
        const score = ppg === null ? null : ppg * posWeight * ageFactor(p.position, p.age);
        return { ...p, score };
    });
    const top = Math.max(1, ...scored.map((p) => p.score || 0));
    return scored.map((p) => {
        let v;
        if (p.score === null) v = CONFIG.noStatsFloor * ageFactor(p.position, p.age);
        else v = 10000 * Math.pow(Math.max(0, p.score) / top, CONFIG.curve);
        return { ...p, seed_value: Math.round(Math.min(10000, Math.max(100, v))) };
    });
}

// currentSeason = the NFL season being played. Picks cover the next three drafts.
function buildPicks(currentSeason, yearDiscount, rounds = 3, yearsAhead = 3) {
    const out = [];
    for (let i = 1; i <= yearsAhead; i++) {
        const year = currentSeason + i;
        for (let round = 1; round <= rounds; round++) {
            const base = CONFIG.pickRoundBase[round] || 500;
            out.push({
                id: `pick:${year}:${round}`,
                kind: 'pick',
                name: `${year} ${ordinal(round)}`,
                pick_year: year,
                pick_round: round,
                seed_value: Math.round(base * Math.pow(yearDiscount, i - 1)),
            });
        }
    }
    return out;
}

function ordinal(n) {
    return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`;
}

module.exports = { CONFIG, ageFactor, blendedPpg, valuePlayers, buildPicks };
