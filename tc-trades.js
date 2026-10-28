// tc-trades.js
// Turns Sleeper trade transactions into rows for tc_real_trades.
// Pure parsing lives here so it can be tested without the network.

const MAX_PER_SIDE = 3;

// ctx:
//   rosterOwner: Map roster_id -> sleeper owner_id for the league the trade came from
//   ownerToTeam: Map sleeper owner_id -> teams.id (uuid) for the current season
//   validAssets: Set of asset ids that exist and are tracked (players 'p:<id>', picks 'pick:<year>:<round>')
function parseTrades(transactions, ctx) {
    const out = [];
    for (const tx of transactions || []) {
        if (!tx || tx.type !== 'trade' || tx.status !== 'complete') continue;
        const rosters = tx.roster_ids || [];
        if (rosters.length !== 2) continue;                        // two-team trades only
        if ((tx.waiver_budget || []).length) continue;             // FAAB cannot be valued

        const [r1, r2] = rosters;
        const sent = { [r1]: [], [r2]: [] };                       // roster_id -> asset ids it gave away

        let ok = true;
        for (const [pid, receiver] of Object.entries(tx.adds || {})) {
            const giver = receiver === r1 ? r2 : receiver === r2 ? r1 : null;
            if (giver === null) { ok = false; break; }
            sent[giver].push(`p:${pid}`);
        }
        if (!ok) continue;
        for (const p of tx.draft_picks || []) {
            const giver = p.previous_owner_id;
            if (!(giver in sent) || p.owner_id === giver) { ok = false; break; }
            sent[giver].push(`pick:${p.season}:${p.round}:${p.roster_id}`);
        }
        if (!ok) continue;

        const sideA = sent[r1];
        const sideB = sent[r2];
        const all = [...sideA, ...sideB];
        if (!sideA.length || !sideB.length) continue;
        if (sideA.length > MAX_PER_SIDE || sideB.length > MAX_PER_SIDE) continue;
        if (new Set(all).size !== all.length) continue;            // same pick type twice, etc.
        if (!all.every((id) => ctx.validAssets.has(id))) continue; // dropped players, old picks

        out.push({
            id: String(tx.transaction_id),
            happened_at: new Date(tx.status_updated || tx.created || Date.now()).toISOString(),
            side_a: sideA,
            side_b: sideB,
            team_a: ctx.ownerToTeam.get(ctx.rosterOwner.get(r1)) || '',
            team_b: ctx.ownerToTeam.get(ctx.rosterOwner.get(r2)) || '',
        });
    }
    return out;
}

module.exports = { parseTrades, MAX_PER_SIDE };
