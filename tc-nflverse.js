// tc-nflverse.js
// Reads nflverse weekly player stats (public CSV releases) into per-player season rows.

const { FEATURES } = require('./tc-usage');

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

async function loadSeasonRows(year, log) {
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


module.exports = { parseCsv, loadSeasonRows };
