// tc-fit-usage.js
// Fits the usage-implied scoring model from nflverse weekly player stats and backtests it.
// Writes tc_settings.usage_model. Run from the "Fit Usage Model" workflow.

const { createClient } = require('@supabase/supabase-js');
const { fitUsage, backtest, FEATURES } = require('./tc-usage');

const { loadSeasonRows } = require('./tc-nflverse');
const FIRST = Number(process.env.TC_USAGE_FIRST || 2015);
async function main() {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: season } = await db.from('seasons').select('year').eq('is_active', true).order('year', { ascending: false }).limit(1).single();
    const lastFull = season.year - 1;

    const log = [];
    const seasons = {};
    for (let y = FIRST; y <= lastFull; y++) {
        const rows = await loadSeasonRows(y, log);
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
