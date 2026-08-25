// audit-duos-2026.js
// Read-only audit - makes NO changes to anything. Checks the live duos table
// for two kinds of violation that could exist from before the recent fixes:
//
//   1. Next Up players with years_exp >= 3 (entering season 4+) - ineligible
//      under the corrected boundary (previously the code incorrectly allowed
//      up through years_exp 3).
//   2. Cross-award double-booking - the same player used in both a team's
//      Main Award duo AND their Next Up duo, which is no longer allowed.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node audit-duos-2026.js

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrownBellAudit/1.0)' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function main() {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
        process.exit(1);
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: teams, error: teamsError } = await supabase.from('teams').select('id, display_name');
    if (teamsError) {
        console.error('❌ Failed to load teams:', teamsError.message);
        process.exit(1);
    }
    const teamNameById = Object.fromEntries(teams.map(t => [t.id, t.display_name]));

    const { data: duos, error: duosError } = await supabase
        .from('duos')
        .select('team_id, award_type, player_index, player_name, player_position, sleeper_player_id');
    if (duosError) {
        console.error('❌ Failed to load duos:', duosError.message);
        process.exit(1);
    }

    console.log('📡 Fetching live Sleeper player database to check current years of experience...');
    const allPlayers = await fetchJson('https://api.sleeper.app/v1/players/nfl');

    // --- Check 1: Next Up experience violations ---
    const experienceViolations = [];
    for (const row of duos) {
        if (row.award_type !== 'nextup' || !row.sleeper_player_id) continue;
        const player = allPlayers[row.sleeper_player_id];
        const yearsExp = player?.years_exp ?? null;
        if (yearsExp !== null && yearsExp >= 3) {
            experienceViolations.push({
                team: teamNameById[row.team_id] || row.team_id,
                slot: row.player_index,
                playerName: row.player_name,
                yearsExp
            });
        }
    }

    // --- Check 2: cross-award double-booking ---
    const byTeamAndPlayer = new Map(); // `${teamId}|${sleeperPlayerId}` -> [award_type, ...]
    for (const row of duos) {
        if (!row.sleeper_player_id) continue;
        const key = `${row.team_id}|${row.sleeper_player_id}`;
        const list = byTeamAndPlayer.get(key) || [];
        list.push(row);
        byTeamAndPlayer.set(key, list);
    }
    const crossAwardViolations = [];
    for (const [, rows] of byTeamAndPlayer) {
        const awardTypes = new Set(rows.map(r => r.award_type));
        if (awardTypes.size > 1) {
            crossAwardViolations.push({
                team: teamNameById[rows[0].team_id] || rows[0].team_id,
                playerName: rows[0].player_name,
                usedIn: rows.map(r => r.award_type).join(' AND ')
            });
        }
    }

    console.log(`\n📊 Checked ${duos.length} duo rows across ${teams.length} teams\n`);

    if (experienceViolations.length === 0) {
        console.log('✅ No Next Up experience violations found.');
    } else {
        console.log(`🚨 ${experienceViolations.length} Next Up experience violation(s) - entering season 4+, no longer eligible:`);
        experienceViolations.forEach(v => {
            console.log(`   ${v.team} / slot ${v.slot}: ${v.playerName} (${v.yearsExp} yrs exp, entering season ${v.yearsExp + 1})`);
        });
    }

    console.log('');

    if (crossAwardViolations.length === 0) {
        console.log('✅ No cross-award double-bookings found.');
    } else {
        console.log(`🚨 ${crossAwardViolations.length} cross-award double-booking(s):`);
        crossAwardViolations.forEach(v => {
            console.log(`   ${v.team}: ${v.playerName} used in ${v.usedIn}`);
        });
    }

    console.log('\nThis script made no changes - if anything was flagged above, use the app\'s picker (or the import script) to fix those specific slots.');
}

main().catch(err => {
    console.error('Audit failed:', err);
    process.exit(1);
});
