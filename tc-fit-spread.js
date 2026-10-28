// tc-fit-spread.js
// Measures how far outcomes land from the age projection, from nflverse seasons. Writes
// tc_settings.spread_model. Run from the "Fit Spread" workflow.

const { createClient } = require('@supabase/supabase-js');
const { loadSeasonRows, loadPlayers } = require('./tc-nflverse');
const { spreadModel } = require('./tc-spread');

const FIRST = Number(process.env.TC_SPREAD_FIRST || 2010);

async function main() {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: season } = await db.from('seasons').select('year').eq('is_active', true).order('year', { ascending: false }).limit(1).single();
    const log = [];
    const players = await loadPlayers(log);
    if (!players) throw new Error('no players table: ' + log.join('; '));
    const seasons = {};
    for (let y = FIRST; y < season.year; y++) {
        const rows = await loadSeasonRows(y, log);
        if (!rows || rows.length < 100) continue;
        const start = Date.UTC(y, 8, 1);
        seasons[y] = rows.map((r) => {
            const p = players.get(r.pid);
            const age = p && p.birth ? (start - Date.parse(p.birth)) / (365.25 * 86400_000) : NaN;
            return { ...r, age };
        }).filter((r) => Number.isFinite(r.age));
    }
    const model = spreadModel(seasons);
    const result = { fittedAt: new Date().toISOString(), seasons: Object.keys(seasons).map(Number), log, model };
    const { error } = await db.from('tc_settings').update({ spread_model: result }).eq('id', 1);
    if (error) throw error;
    console.log(JSON.stringify(model));
}

main().catch(async (e) => {
    console.error('tc-fit-spread failed:', e.message || e);
    try {
        const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
        await db.from('tc_settings').update({ spread_model: { error: String(e.stack || e.message || e).slice(0, 1500) } }).eq('id', 1);
    } catch { /* ignore */ }
    process.exit(1);
});
