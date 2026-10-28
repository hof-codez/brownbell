// tc-fit-curves.js
// Fits QB/RB/WR/TE age curves from Sleeper's past weekly stats and writes them, with a backtest,
// to tc_settings.age_curves. Run from the "Fit Age Curves" workflow. Not part of the daily seed.

const { createClient } = require('@supabase/supabase-js');
const { fitAndTest, fitAll } = require('./tc-curves');

const SLEEPER = 'https://api.sleeper.app/v1';
const SCORING_KEY = process.env.TC_SCORING_KEY || 'pts_ppr';
const FIRST_SEASON = Number(process.env.TC_CURVE_FIRST || 2013);
const POS = new Set(['QB', 'RB', 'WR', 'TE']);

async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
}

async function seasonRows(year, players) {
    const totals = new Map();
    for (let week = 1; week <= 18; week++) {
        let weekly;
        try { weekly = await getJson(`${SLEEPER}/stats/nfl/regular/${year}/${week}`); } catch { continue; }
        for (const [pid, s] of Object.entries(weekly || {})) {
            const pts = Number(s?.[SCORING_KEY]);
            const played = Number(s?.gp) > 0 || (Number.isFinite(pts) && pts !== 0);
            if (!played || !Number.isFinite(pts)) continue;
            const t = totals.get(pid) || { games: 0, points: 0 };
            t.games += 1; t.points += pts;
            totals.set(pid, t);
        }
    }
    const start = Date.UTC(year, 8, 1);
    const rows = [];
    for (const [pid, t] of totals) {
        const p = players[pid];
        if (!p || !POS.has(p.position) || !p.birth_date) continue;
        const born = Date.parse(p.birth_date);
        if (!Number.isFinite(born)) continue;
        const age = (start - born) / (365.25 * 86400_000);
        if (age < 19 || age > 45) continue;
        rows.push({ pid, pos: p.position, age, games: t.games, ppg: t.points / t.games });
    }
    return rows;
}

async function main() {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) { console.error('Missing Supabase env'); process.exit(1); }
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    const { data: season } = await db.from('seasons').select('year').eq('is_active', true).order('year', { ascending: false }).limit(1).single();
    const lastFull = season.year - 1;
    const players = await getJson(`${SLEEPER}/players/nfl`);

    const seasons = {};
    for (let y = FIRST_SEASON; y <= lastFull; y++) {
        const rows = await seasonRows(y, players);
        console.log(`${y}: ${rows.length} player seasons`);
        if (rows.length > 100) seasons[y] = rows;
    }
    if (Object.keys(seasons).length < 6) throw new Error('not enough seasons to fit');

    const test = fitAndTest(seasons);
    const fitted = fitAll(seasons);
    const out = {
        fittedAt: new Date().toISOString(),
        seasons: Object.keys(seasons).map(Number),
        from: 21,
        curves: Object.fromEntries(Object.entries(fitted).map(([k, v]) => [k, v.v])),
        sharedDrop: Object.fromEntries(Object.entries(fitted).map(([k, v]) => [k, v.sharedDrop])),
        samples: Object.fromEntries(Object.entries(fitted).map(([k, v]) => [k, v.samples])),
        yearOverYear: Object.fromEntries(Object.entries(fitted).map(([k, v]) => [k, v.ratios])),
        backtest: test.report,
        backtestTrain: test.trainYears,
        backtestTest: test.testYears,
    };
    const { error } = await db.from('tc_settings').update({ age_curves: out }).eq('id', 1);
    if (error) throw error;
    console.log('Backtest (mean absolute error in points per game, lower is better):', JSON.stringify(test.report));
}

main().catch((e) => { console.error('tc-fit-curves failed:', e.message || e); process.exit(1); });
