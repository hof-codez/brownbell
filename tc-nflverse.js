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
                const t = per.get(r[ix.player_id]) || { name: r[ix.player_display_name] || r[ix.player_name] || '', pos, games: 0, pts: 0, targets: 0, carries: 0, attempts: 0 };
                t.games += 1; t.pts += num(r, 'fantasy_points_ppr');
                t.targets += num(r, 'targets'); t.carries += num(r, 'carries'); t.attempts += num(r, 'attempts');
                per.set(r[ix.player_id], t);
            }
            const out = [...per].map(([pid, t]) => ({
                pid, name: t.name, pos: t.pos, games: t.games, ppg: t.pts / t.games,
                targets: t.targets / t.games, carries: t.carries / t.games, attempts: t.attempts / t.games,
            }));
            log.push(`${year}: ${out.length} player seasons`);
            return out;
        } catch (e) { log.push(`${year}: ${e.message}`); }
    }
    return null;
}


module.exports = { parseCsv, loadSeasonRows };

// nflverse players table: draft round and pick, draft year, birth date, keyed by gsis id.
async function loadPlayers(log) {
    const urls = [`${BASE}/players/players.csv`];
    for (const url of urls) {
        try {
            const res = await fetch(url, { redirect: 'follow' });
            if (!res.ok) { log.push(`players: ${res.status}`); continue; }
            const [head, ...body] = parseCsv(await res.text());
            const ix = Object.fromEntries(head.map((h, i) => [h, i]));
            if (ix.gsis_id === undefined) { log.push(`players: no gsis_id, columns ${head.slice(0, 30).join('|')}`); continue; }
            const out = new Map();
            for (const r of body) {
                const gsis = r[ix.gsis_id];
                if (!gsis) continue;
                const num = (k) => (ix[k] === undefined || r[ix[k]] === '' || r[ix[k]] === 'NA' ? null : Number(r[ix[k]]));
                out.set(gsis, {
                    draftYear: num('draft_year'), draftRound: num('draft_round'), draftPick: num('draft_pick'),
                    birth: ix.birth_date !== undefined ? r[ix.birth_date] : null,
                });
            }
            log.push(`players: ${out.size} rows, columns ${head.filter((h) => /draft|birth|rookie/.test(h)).join('|')}`);
            return out;
        } catch (e) { log.push(`players: ${e.message}`); }
    }
    return null;
}

module.exports.loadPlayers = loadPlayers;
