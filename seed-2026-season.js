// seed-2026-season.js
// Creates the 2026 season and one team row per Sleeper roster, pulled fresh from the
// live Sleeper API. Deliberately does NOT seed duos, substitutions, or scores - those
// start empty for the new season. No 2025 player data goes anywhere near this script;
// team identity (roster ownership) is the only thing that legitimately carries forward.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SLEEPER_LEAGUE_ID=... node seed-2026-season.js

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function main() {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SLEEPER_LEAGUE_ID } = process.env;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SLEEPER_LEAGUE_ID) {
        console.error('❌ Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SLEEPER_LEAGUE_ID env vars');
        process.exit(1);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('📡 Fetching live league data from Sleeper...');
    const [rosters, users] = await Promise.all([
        fetchJson(`https://api.sleeper.app/v1/league/${SLEEPER_LEAGUE_ID}/rosters`),
        fetchJson(`https://api.sleeper.app/v1/league/${SLEEPER_LEAGUE_ID}/users`)
    ]);

    const userMap = {};
    users.forEach(u => { userMap[u.user_id] = u.display_name || u.username || `User ${u.user_id}`; });

    console.log(`✅ Found ${rosters.length} rosters in league ${SLEEPER_LEAGUE_ID}`);

    // Create (or fetch existing) season row
    const { data: existingSeason } = await supabase
        .from('seasons')
        .select('id')
        .eq('year', 2026)
        .maybeSingle();

    let seasonId = existingSeason?.id;

    if (!seasonId) {
        const { data: newSeason, error: seasonError } = await supabase
            .from('seasons')
            .insert({ year: 2026, sleeper_league_id: SLEEPER_LEAGUE_ID, current_week: 1, is_active: true })
            .select('id')
            .single();

        if (seasonError) {
            console.error('❌ Failed to create season:', seasonError.message);
            process.exit(1);
        }
        seasonId = newSeason.id;
        console.log(`✅ Created 2026 season (id: ${seasonId})`);
    } else {
        console.log(`ℹ️ 2026 season already exists (id: ${seasonId}) - adding/updating teams only`);
    }

    const teamRows = rosters.map(r => ({
        season_id: seasonId,
        sleeper_roster_id: String(r.roster_id),
        sleeper_owner_id: r.owner_id,
        display_name: userMap[r.owner_id] || `Roster ${r.roster_id}`
    }));

    const { data: insertedTeams, error: teamsError } = await supabase
        .from('teams')
        .upsert(teamRows, { onConflict: 'season_id,sleeper_roster_id' })
        .select('id, display_name');

    if (teamsError) {
        console.error('❌ Failed to seed teams:', teamsError.message);
        process.exit(1);
    }

    console.log(`✅ Seeded ${insertedTeams.length} teams for 2026:`);
    insertedTeams.forEach(t => console.log(`   - ${t.display_name}`));
    console.log('\nNote: no duos were seeded - owners set their QB/RB/WR pairing through the app.');
}

main();
