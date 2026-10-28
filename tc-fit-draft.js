// tc-fit-draft.js
// Tests whether experience and draft capital improve next-season projections for young players,
// and stores the multipliers. Writes tc_settings.draft_model. Run from the "Fit Draft Model" workflow.

const { createClient } = require('@supabase/supabase-js');
const { loadSeasonRows, loadPlayers } = require('./tc-nflverse');
const { youngPairs, fitDraft, backtest, prospectPairs, fitProspects, backtestProspects } = require('./tc-draft');

const FIRST = Number(process.env.TC_DRAFT_FIRST || 2010);

async function main() {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: season } = await db.from('seasons').select('year').eq('is_active', true).order('year', { ascending: false }).limit(1).single();
    const lastFull = season.year - 1;

    const log = [];
    const players = await loadPlayers(log);
    const seasons = {};
    for (let y = FIRST; y <= lastFull; y++) {
        const rows = await loadSeasonRows(y, log);
        if (rows && rows.length > 100) seasons[y] = rows;
    }
    const years = Object.keys(seasons).map(Number).sort((a, b) => a - b);
    const result = { fittedAt: new Date().toISOString(), log, seasons: years };
    if (players && years.length >= 6) {
        const last = years[years.length - 1];
        // train on transitions that end before the test years, test on the newest transitions
        result.backtest = backtest(seasons, players, years.filter((y) => y <= last - 4), [last - 3, last - 2, last - 1].filter((y) => seasons[y + 1]));
        const train = years.filter((y) => y <= last - 4);
        const testY = [last - 3, last - 2, last - 1].filter((y) => seasons[y + 1]);
        result.prospectBacktest = backtestProspects(seasons, players, train, testY);
        result.prospectModel = fitProspects(prospectPairs(seasons, players, years));
        const model = fitDraft(youngPairs(seasons, players, years));
        result.model = model;
        result.coverage = {
            withDraftYear: [...players.values()].filter((p) => p.draftYear).length,
            players: players.size,
        };
    }
    const { error } = await db.from('tc_settings').update({ draft_model: result }).eq('id', 1);
    if (error) throw error;
    console.log(JSON.stringify(result.backtest || log));
}

main().catch((e) => { console.error('tc-fit-draft failed:', e.message || e); process.exit(1); });
