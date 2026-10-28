// tc-snapshots.js
// Rebuilds both rosters as they stood just before a trade by walking Sleeper's
// transaction log backward from the league's end-of-season rosters. Pure, no network.

const txTime = (tx) => Number(tx.status_updated || tx.created || 0);

// rosters: Sleeper /rosters array. txs: every completed transaction of the league (any type).
// trade: the trade transaction. Returns { [rosterId]: Set(playerId) } just before the trade.
function rosterBefore(rosters, txs, trade, rosterIds) {
    const sets = new Map(rosters.map((r) => [r.roster_id, new Set((r.players || []).map(String))]));
    const cutoff = txTime(trade);
    const later = txs
        .filter((t) => t && t.status === 'complete' && txTime(t) >= cutoff)
        .sort((a, b) => txTime(b) - txTime(a));
    for (const t of later) {
        for (const [pid, rid] of Object.entries(t.adds || {})) sets.get(rid)?.delete(String(pid));
        for (const [pid, rid] of Object.entries(t.drops || {})) sets.get(rid)?.add(String(pid));
    }
    const out = {};
    for (const rid of rosterIds) out[rid] = sets.get(rid) || new Set();
    return out;
}

// weekly: { [week]: { [playerId]: points } } for one season. Returns { ppg, games } through `lastWeek`.
function ppgThrough(weekly, pid, lastWeek) {
    let pts = 0, games = 0;
    for (let w = 1; w <= lastWeek; w++) {
        const v = weekly?.[w]?.[pid];
        if (typeof v === 'number' && Number.isFinite(v)) { pts += v; games += 1; }
    }
    return { ppg: games ? Math.round((pts / games) * 10) / 10 : null, games };
}

// Which stats to use: this season through the week before the trade when at least 3 games have
// been played by then, otherwise last season in full.
function pickBasis(leg) {
    const wk = Math.max(0, Math.min(18, Number(leg) || 0));
    return wk - 1 >= 3 ? { basis: 'this', through: wk - 1 } : { basis: 'last', through: 18 };
}

module.exports = { rosterBefore, ppgThrough, pickBasis, txTime };
