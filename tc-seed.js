// tc-seed.js
// Keeps the trade calculator's asset list in step with the league.
// - Pulls rosters, players and stats from Sleeper
// - Adds new players at an outside-value starting rating
// - Never touches ratings that league votes have already moved
// - Refreshes who owns which player so voters are not shown their own guys
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SLEEPER_LEAGUE_ID
// Optional: TC_SCORING_KEY (default pts_ppr), TC_SUPERFLEX (default false, set true for superflex)
// Run: node tc-seed.js

const { createClient } = require('@supabase/supabase-js');
const { CONFIG, valuePlayers } = require('./tc-valuation');
const { parseTrades } = require('./tc-trades');

const { loadSeasonRows } = require('./tc-nflverse');
const { predictUsage } = require('./tc-usage');
const { buildTeamPicks, projectedSlots } = require('./tc-picks');
const { rosterBefore, ppgThrough, pickBasis, txTime } = require('./tc-snapshots');
const SLEEPER = 'https://api.sleeper.app/v1';
const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const SCORING_KEY = process.env.TC_SCORING_KEY || 'pts_ppr';
if (process.env.TC_SUPERFLEX === 'true') CONFIG.superflex = true;

async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
}

// Sums a season's weekly stats into { playerId: { games, points } }
async function seasonStats(season, lastWeek) {
    const totals = {};
    for (let week = 1; week <= lastWeek; week++) {
        let weekly;
        try {
            weekly = await getJson(`${SLEEPER}/stats/nfl/regular/${season}/${week}`);
        } catch (e) {
            console.log(`  stats ${season} wk${week} skipped (${e.message})`);
            continue;
        }
        for (const [id, s] of Object.entries(weekly || {})) {
            const pts = Number(s?.[SCORING_KEY]);
            const played = Number(s?.gp) > 0 || (Number.isFinite(pts) && pts !== 0);
            if (!played || !Number.isFinite(pts)) continue;
            const t = (totals[id] ||= { games: 0, points: 0 });
            t.games += 1;
            t.points += pts;
        }
    }
    return totals;
}

async function main() {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SLEEPER_LEAGUE_ID } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SLEEPER_LEAGUE_ID) {
        console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SLEEPER_LEAGUE_ID');
        process.exit(1);
    }
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: season, error: sErr } = await db
        .from('seasons').select('id, year, current_week').eq('is_active', true)
        .order('year', { ascending: false }).limit(1).single();
    if (sErr) throw sErr;
    const { data: teams, error: tErr } = await db
        .from('teams').select('id, display_name, sleeper_roster_id, sleeper_owner_id').eq('season_id', season.id);
    if (tErr) throw tErr;
    const teamByRoster = new Map(teams.map((t) => [String(t.sleeper_roster_id), t.id]));

    const { data: settings } = await db.from('tc_settings').select('pick_year_discount').eq('id', 1).single();
    const discount = Number(settings?.pick_year_discount ?? 0.92);

    console.log(`Season ${season.year}, week ${season.current_week}`);
    const [rosters, allPlayers, tradedPicks] = await Promise.all([
        getJson(`${SLEEPER}/league/${SLEEPER_LEAGUE_ID}/rosters`),
        getJson(`${SLEEPER}/players/nfl`),
        getJson(`${SLEEPER}/league/${SLEEPER_LEAGUE_ID}/traded_picks`).catch(() => []),
    ]);

    const owner = new Map(); // sleeper player id -> team uuid
    for (const r of rosters) {
        const teamId = teamByRoster.get(String(r.roster_id));
        if (!teamId) { console.log(`  roster ${r.roster_id} has no team row, skipped`); continue; }
        for (const pid of r.players || []) owner.set(String(pid), teamId);
    }

    const players = [];
    for (const [pid] of owner) {
        const p = allPlayers[pid];
        if (!p || !POSITIONS.has(p.position)) continue;
        players.push({
            id: pid,
            name: p.full_name || `${p.first_name} ${p.last_name}`,
            position: p.position,
            team: p.team || null,
            age: p.age || null,
        });
    }
    console.log(`${players.length} rostered QB/RB/WR/TE`);

    const nowWeeks = Math.max(1, Math.min(18, season.current_week));
    const [statsNow, statsPrev] = await Promise.all([
        seasonStats(season.year, nowWeeks),
        seasonStats(season.year - 1, 18),
    ]);

    const valued = valuePlayers(players, statsNow, statsPrev);
    // One pick per original team, owned by whoever holds it, valued by the original team's standing
    const teamRows = teams.filter((t) => rosters.some((r) => String(r.roster_id) === String(t.sleeper_roster_id)));
    const teamPicks = buildTeamPicks({
        currentSeason: season.year,
        discount,
        teams: teamRows.map((t) => ({ rosterId: t.sleeper_roster_id, name: t.display_name, teamId: t.id })),
        standings: rosters.map((r) => ({
            rosterId: r.roster_id,
            wins: r.settings?.wins || 0,
            losses: r.settings?.losses || 0,
            ties: r.settings?.ties || 0,
            pointsFor: (r.settings?.fpts || 0) + (r.settings?.fpts_decimal || 0) / 100,
        })),
        tradedPicks,
    });
    console.log(`${teamPicks.assets.length} team picks, ${tradedPicks.length} traded`);
    // Record and rank per team, for the calculator's contender or builder guess. Best effort.
    try {
        const standings = rosters.map((r) => ({
            rosterId: r.roster_id, wins: r.settings?.wins || 0, losses: r.settings?.losses || 0, ties: r.settings?.ties || 0,
            pointsFor: (r.settings?.fpts || 0) + (r.settings?.fpts_decimal || 0) / 100,
        }));
        const { slots, size } = projectedSlots(standings);
        const rowsTs = standings.map((s) => {
            const t = teams.find((x) => String(x.sleeper_roster_id) === String(s.rosterId));
            return t ? { team_id: t.id, wins: s.wins, losses: s.losses, ties: s.ties, points_for: s.pointsFor, rank: size - slots.get(String(s.rosterId)) + 1, size, updated_at: new Date().toISOString() } : null;
        }).filter(Boolean);
        const { error: tsErr } = await db.from('tc_team_status').upsert(rowsTs, { onConflict: 'team_id' });
        if (tsErr) throw tsErr;
    } catch (e) {
        console.log('Team status skipped:', e.message || e);
    }
    const assets = [
        ...valued.map((p) => ({
            id: `p:${p.id}`, kind: 'player', name: p.name, position: p.position,
            nfl_team: p.team, age: p.age, seed_value: p.seed_value,
        })),
        ...teamPicks.assets,
    ];
    const holdings = [
        ...valued.map((p) => ({ asset_id: `p:${p.id}`, team_id: owner.get(p.id) })),
        ...teamPicks.holdings,
    ];

    const { data, error } = await db.rpc('tc_sync_assets', { p_assets: assets, p_holdings: holdings });
    if (error) throw error;
    console.log('Synced:', JSON.stringify(data));

    // Lineup fit data: points per game, injuries, bye weeks and the league's lineup slots.
    // Also best effort: a failure only logs and leaves yesterday's data in place.
    try {
        await syncLineupData(db, SLEEPER_LEAGUE_ID, season, valued, allPlayers, statsNow);
    } catch (e) {
        console.log('Lineup data sync skipped:', e.message || e);
    }

    // Real trades from this league and the seasons before it, for the Offer Desk.
    // A failure here must not undo the asset sync above, so it only logs.
    try {
        const ownerToTeam = new Map(teams.map((t) => [String(t.sleeper_owner_id), t.id]));
        const validAssets = new Set(assets.map((a) => a.id));
        const { data: have } = await db.from('tc_trade_snapshots').select('trade_id').gte('snap_v', 2);
        const { data: stat } = await db.from('tc_player_status').select('asset_id, injury_status');
        const snap = {
            allPlayers,
            existing: new Set((have || []).map((r) => r.trade_id)),
            injNow: new Map((stat || []).map((r) => [r.asset_id, r.injury_status])),
            rows: [],
            year: season.year,
            byes: await byeWeeks(season.year).catch(() => ({})),
        };
        const trades = await collectTrades(SLEEPER_LEAGUE_ID, ownerToTeam, validAssets, snap);
        const { data: n, error: tErr } = await db.rpc('tc_sync_real_trades', { p_trades: trades });
        if (tErr) throw tErr;
        console.log(`Real trades usable for voting: ${trades.length} (rows written: ${n})`);
        if (snap.rows.length) {
            const { error: sErr2 } = await db.from('tc_trade_snapshots').upsert(snap.rows, { onConflict: 'trade_id' });
            if (sErr2) throw sErr2;
            console.log(`Trade roster snapshots written: ${snap.rows.length}`);
        }
    } catch (e) {
        console.log('Real trade sync skipped:', e.message || e);
    }
}

const SLOT_KEEP = new Set(['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'REC_FLEX', 'WRRB_FLEX']);
const ESPN_FIX = { WSH: 'WAS' };
const ALL_TEAMS = ['ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE','DAL','DEN','DET','GB','HOU','IND','JAX','KC','LV','LAC','LAR','MIA','MIN','NE','NO','NYG','NYJ','PHI','PIT','SF','SEA','TB','TEN','WAS'];

// NFL bye week per team from ESPN's public scoreboard: a team with no game that week is on bye.
async function byeWeeks(year) {
    const byes = {};
    for (let week = 1; week <= 18; week++) {
        let data;
        try {
            data = await getJson(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&year=${year}`);
        } catch { continue; }
        const events = data?.events || [];
        if (events.length < 8) continue; // week not published, do not guess
        const playing = new Set();
        for (const ev of events) {
            for (const c of ev.competitions?.[0]?.competitors || []) {
                const abbr = c.team?.abbreviation;
                if (abbr) playing.add(ESPN_FIX[abbr] || abbr);
            }
        }
        for (const t of ALL_TEAMS) if (!playing.has(t) && byes[t] === undefined) byes[t] = week;
    }
    return byes;
}

function normalizeInjury(p) {
    const raw = String(p.injury_status || '').toUpperCase();
    if (['OUT', 'IR', 'PUP', 'SUS', 'DOUBTFUL', 'QUESTIONABLE'].includes(raw)) return raw;
    if (String(p.status || '').toLowerCase().includes('injured reserve')) return 'IR';
    return null;
}

async function syncLineupData(db, leagueId, season, valued, allPlayers, statsNow) {
    const league = await getJson(`${SLEEPER}/league/${leagueId}`);
    const slots = (league.roster_positions || []).filter((p) => SLOT_KEEP.has(p));
    const playoffStart = Number(league.settings?.playoff_week_start) || 15;
    if (slots.length) {
        const { error } = await db.from('tc_settings')
            .update({ lineup_slots: slots, last_regular_week: Math.max(1, playoffStart - 1) }).eq('id', 1);
        if (error) throw error;
    }
    const byes = await byeWeeks(season.year);
    console.log(`Lineup slots: ${slots.join(',') || '(none found)'}; bye weeks found for ${Object.keys(byes).length} teams`);

    // Usage signals: what each player's touches say he should score, from nflverse and the fitted model.
    // Best effort. Without them the app falls back to plain points per game.
    const usage = new Map();
    try {
        const { data: cfg } = await db.from('tc_settings').select('usage_model').eq('id', 1).single();
        const models = cfg?.usage_model?.models;
        if (models) {
            const log = [];
            const nfl = await loadSeasonRows(season.year, log);
            console.log(`nflverse ${log.join('; ')}`);
            const byGsis = new Map();
            for (const [pid, raw] of Object.entries(allPlayers)) if (raw.gsis_id) byGsis.set(raw.gsis_id, pid);
            // fallback when Sleeper has no gsis id for a player: unique name and position match
            const norm = (n) => String(n || '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '').replace(/[^a-z]/g, '');
            const byName = new Map();
            for (const p of valued) {
                const k = `${norm(allPlayers[p.id]?.full_name || p.name)}|${p.position}`;
                byName.set(k, byName.has(k) ? null : p.id);
            }
            for (const r of nfl || []) {
                const pid = byGsis.get(r.pid) || byName.get(`${norm(r.name)}|${r.pos}`);
                const m = models[r.pos];
                if (!pid || !m) continue;
                const u = predictUsage(m, r);
                usage.set(pid, { u, gap: r.ppg - u, games: r.games, targets: r.targets, carries: r.carries, cur: r.ppg });
            }
            console.log(`Usage signals for ${usage.size} players`);
            const missed = (nfl || []).filter((r) => !byGsis.has(r.pid) && !byName.get(`${norm(r.name)}|${r.pos}`) && r.games >= 3).slice(0, 12).map((r) => `${r.name} ${r.pos} ${r.pid}`);
            const diag = { at: new Date().toISOString(), nflRows: (nfl || []).length, matched: usage.size, unmatchedSample: missed, log };
            await db.from('tc_settings').update({ usage_model: { ...cfg.usage_model, lastSync: diag } }).eq('id', 1);
        }
    } catch (e) {
        console.log('Usage signals skipped:', e.message || e);
    }

    const rows = valued.map((p) => {
      const raw = allPlayers[p.id] || {};
      const st = statsNow[p.id];
      const us = usage.get(p.id);
      const ppgNow = st && st.games > 0 ? st.points / st.games : null;
      const r2 = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100);
      return {
        usage_ppg: us ? r2(us.u) : null,
        usage_gap: us ? r2(us.gap) : null,
        usage_games: us ? us.games : null,
        targets_pg: us ? r2(us.targets) : null,
        carries_pg: us ? r2(us.carries) : null,
        proj_ppg: us ? r2(ppgNow === null ? us.u : (ppgNow + us.u) / 2) : null,
        asset_id: `p:${p.id}`,
        ppg: st && st.games > 0 ? Math.round((st.points / st.games) * 100) / 100 : null,
        games: st ? st.games : 0,
        injury_status: normalizeInjury(raw),
        bye_week: byes[raw.team] ?? null,
        updated_at: new Date().toISOString(),
      };
    });
    for (let i = 0; i < rows.length; i += 200) {
        const { error } = await db.from('tc_player_status').upsert(rows.slice(i, i + 200), { onConflict: 'asset_id' });
        if (error) throw error;
    }
    console.log(`Player status rows written: ${rows.length}`);
}


// Weekly points per player for one season: { [week]: { [playerId]: points } }. Cached per run.
const weeklyCache = new Map();
async function weeklyPoints(season) {
    if (weeklyCache.has(season)) return weeklyCache.get(season);
    const out = {};
    for (let week = 1; week <= 18; week++) {
        try {
            const weekly = await getJson(`${SLEEPER}/stats/nfl/regular/${season}/${week}`);
            const m = {};
            for (const [id, st] of Object.entries(weekly || {})) {
                const pts = Number(st?.[SCORING_KEY]);
                const played = Number(st?.gp) > 0 || (Number.isFinite(pts) && pts !== 0);
                if (played && Number.isFinite(pts)) m[id] = pts;
            }
            out[week] = m;
        } catch { out[week] = {}; }
    }
    weeklyCache.set(season, out);
    return out;
}

// Roster snapshot rows for trades that do not have one yet.
async function snapshotRows(tx, league, rosters, allTxs, snap) {
    const [r1, r2] = tx.roster_ids;
    const before = rosterBefore(rosters, allTxs, tx, [r1, r2]);
    const { basis, through } = pickBasis(tx.leg);
    const season = basis === 'this' ? Number(league.season) : Number(league.season) - 1;
    const weekly = await weeklyPoints(season);
    const recent = Date.now() - txTime(tx) < 3 * 86400_000;
    const shape = (set) => [...set].map((pid) => {
        const p = snap.allPlayers[pid];
        if (!p || !POSITIONS.has(p.position)) return null;
        const { ppg, games } = ppgThrough(weekly, pid, through);
        return {
            id: pid,
            name: p.full_name || `${p.first_name} ${p.last_name}`,
            pos: p.position,
            age: p.age || null,
            ppg, games,
            bye: Number(league.season) === snap.year ? (snap.byes[p.team] ?? null) : null,
            inj: recent ? (snap.injNow.get(`p:${pid}`) || null) : null,
        };
    }).filter(Boolean).sort((a, b) => (b.ppg ?? -1) - (a.ppg ?? -1));
    return {
        snap_v: 2,
        trade_id: String(tx.transaction_id),
        season: Number(league.season),
        week: Math.max(1, Math.min(18, Number(tx.leg) || 1)),
        basis,
        injuries_known: recent,
        roster_a: shape(before[r1]),
        roster_b: shape(before[r2]),
    };
}

// Walks back through previous seasons (up to 3 extra) and parses every trade.
async function collectTrades(leagueId, ownerToTeam, validAssets, snap) {
    const all = [];
    let id = leagueId;
    for (let seasonsBack = 0; id && seasonsBack < 4; seasonsBack++) {
        let league;
        let rosters;
        try {
            [league, rosters] = await Promise.all([
                getJson(`${SLEEPER}/league/${id}`),
                getJson(`${SLEEPER}/league/${id}/rosters`),
            ]);
        } catch (e) {
            console.log(`  league ${id} not readable (${e.message})`);
            break;
        }
        const rosterOwner = new Map(rosters.map((r) => [r.roster_id, String(r.owner_id)]));
        const txs = [];
        const allTxs = [];
        for (let round = 0; round <= 18; round++) {
            try {
                const list = await getJson(`${SLEEPER}/league/${id}/transactions/${round}`);
                for (const t of list || []) {
                    if (t.status === 'complete') allTxs.push(t);
                    if (t.type === 'trade') txs.push(t);
                }
            } catch { /* some rounds are empty or missing */ }
        }
        const parsed = parseTrades(txs, { rosterOwner, ownerToTeam, validAssets });
        console.log(`  league ${id} (${league.season}): ${txs.length} trades, ${parsed.length} usable`);
        all.push(...parsed);
        for (const row of parsed) {
            if (snap.existing.has(row.id)) continue;
            const tx = txs.find((t) => String(t.transaction_id) === row.id);
            try { snap.rows.push(await snapshotRows(tx, league, rosters, allTxs, snap)); }
            catch (e) { console.log(`  snapshot for ${row.id} skipped (${e.message})`); }
        }
        id = league.previous_league_id && league.previous_league_id !== '0' ? league.previous_league_id : null;
    }
    return all;
}

main().catch((e) => { console.error('tc-seed failed:', e.message || e); process.exit(1); });
