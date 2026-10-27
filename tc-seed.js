// tc-seed.js
// Keeps the trade calculator's asset list in step with the league.
// - Pulls rosters, players and stats from Sleeper
// - Adds new players at an outside-value starting rating
// - Never touches ratings that league votes have already moved
// - Refreshes who owns which player so voters are not shown their own guys
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SLEEPER_LEAGUE_ID
// Optional: TC_SCORING_KEY (default pts_ppr), TC_SUPERFLEX (default true)
// Run: node tc-seed.js

const { createClient } = require('@supabase/supabase-js');
const { CONFIG, valuePlayers, buildPicks } = require('./tc-valuation');

const SLEEPER = 'https://api.sleeper.app/v1';
const POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
const SCORING_KEY = process.env.TC_SCORING_KEY || 'pts_ppr';
if (process.env.TC_SUPERFLEX === 'false') CONFIG.superflex = false;

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
        .from('teams').select('id, sleeper_roster_id').eq('season_id', season.id);
    if (tErr) throw tErr;
    const teamByRoster = new Map(teams.map((t) => [String(t.sleeper_roster_id), t.id]));

    const { data: settings } = await db.from('tc_settings').select('pick_year_discount').eq('id', 1).single();
    const discount = Number(settings?.pick_year_discount ?? 0.92);

    console.log(`Season ${season.year}, week ${season.current_week}`);
    const [rosters, allPlayers] = await Promise.all([
        getJson(`${SLEEPER}/league/${SLEEPER_LEAGUE_ID}/rosters`),
        getJson(`${SLEEPER}/players/nfl`),
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
    const assets = [
        ...valued.map((p) => ({
            id: `p:${p.id}`, kind: 'player', name: p.name, position: p.position,
            nfl_team: p.team, age: p.age, seed_value: p.seed_value,
        })),
        ...buildPicks(season.year, discount),
    ];
    const holdings = valued.map((p) => ({ asset_id: `p:${p.id}`, team_id: owner.get(p.id) }));

    const { data, error } = await db.rpc('tc_sync_assets', { p_assets: assets, p_holdings: holdings });
    if (error) throw error;
    console.log('Synced:', JSON.stringify(data));
}

main().catch((e) => { console.error('tc-seed failed:', e.message || e); process.exit(1); });
