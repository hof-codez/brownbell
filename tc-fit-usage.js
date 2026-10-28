// tc-fit-usage.js
// Fits the usage-implied scoring model from nflverse weekly player stats and backtests it.
// Writes tc_settings.usage_model. Run from the "Fit Usage Model" workflow.

const { createClient } = require('@supabase/supabase-js');
const { fitUsage, backtest, FEATURES } = require('./tc-usage');

const FIRST = Number(process.env.TC_USAGE_FIRST || 2015);
const BASE = 'https://github.com/nflverse/nflverse-data/releases/download';
const URLS = (y) => [
    `${BASE}/stats_player/stats_player_week_${y}.csv`,
    `${BASE}/player_stats/player_stats_${y}.csv`,
];

function parseCsv(text) {
    const rows = [];
    let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
            else field += c;
        } else if (c === '"') q = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c !== '\r') field += c;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
}

async function loadSeason(year, log) {
    for (const url of URLS(year)) {
        try {
            const res = await fetch(url, { redirect: 'follow' });
            if (!res.ok) { log.push(`${year}: ${res.status} ${url.split('/').slice(-2).join('/')}`); continue; }
            const [head, ...body] = parseCsv(await res.text());
            const ix = Object.fromEntries(head.map((h, i) => [h, i]));
            const need = ['player_id', 'position', 'fantasy_points_ppr'];
            if (need.some((n) => ix[n] === undefined)) { log.push(`${year}: missing columns in ${url}`); continue; }
            const num = (r, k) => (ix[k] === undefined ? 0 : Number(r[ix[k]]) || 0);
            const per = new Map();
            for (const r of body) {
                if (ix.season_type !== undefined && r[ix.season_type] !== 'REG') continue;
                const pos = r[ix.position];
                if (!FEATURES[pos]) continue;
                const touches = num(r, 'attempts') + num(r, 'carries') + num(r, 'targets');
                if (touches <= 0) continue;
                const t = per.get(r[ix.player_id]) || { pos, games: 0, pts: 0, targets: 0, carries: 0, attempts: 0 };
                t.games += 1; t.pts += num(r, 'fantasy_points_ppr');
                t.targets += num(r, 'targets'); t.carries += num(r, 'carries'); t.attempts += num(r, 'attempts');
                per.set(r[ix.player_id], t);
            }
            const out = [...per].map(([pid, t]) => ({
                pid, pos: t.pos, games: t.games, ppg: t.pts / t.games,
                targets: t.targets / t.games, carries: t.carries / t.games, attempts: t.attempts / t.games,
            }));
            log.push(`${year}: ${out.length} player seasons`);
            return out;
        } catch (e) { log.push(`${year}: ${e.message}`); }
    }
    return null;
}

async function main() {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: season } = await db.from('seasons').select('year').eq('is_active', true).order('year', { ascending: false }).limit(1).single();
    const lastFull = season.year - 1;

    const log = [];
    const seasons = {};
    for (let y = FIRST; y <= lastFull; y++) {
        const rows = await loadSeason(y, log);
        if (rows && rows.length > 100) seasons[y] = rows;
    }
    const years = Object.keys(seasons).map(Number).sort((a, b) => a - b);
    const result = { fittedAt: new Date().toISOString(), log, seasons: years };
    if (years.length >= 5) {
        const last = years[years.length - 1];
        result.backtest = backtest(seasons, years.filter((y) => y <= last - 3), [last - 2, last - 1]);
        const all = years.flatMap((y) => seasons[y]);
        result.models = Object.fromEntries(Object.keys(FEATURES).map((p) => [p, fitUsage(all, p)]));
    }
    const { error } = await db.from('tc_settings').update({ usage_model: result }).eq('id', 1);
    if (error) throw error;
    console.log(JSON.stringify(result.backtest || log));
}

main().catch((e) => { console.error('tc-fit-usage failed:', e.message || e); process.exit(1); });
