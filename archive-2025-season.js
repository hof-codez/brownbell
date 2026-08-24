// archive-2025-season.js
// Freezes the final 2025 brown-bell-data.json into the season_archive table for
// reference. This is the ONLY place 2025 data goes - it's not read by the live app,
// not used to seed 2026 teams/duos, and nothing here shapes the new season's schema.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node archive-2025-season.js path/to/brown-bell-data.json

const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

async function main() {
    const dataPath = process.argv[2] || 'brown-bell-data.json';
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars');
        process.exit(1);
    }

    if (!fs.existsSync(dataPath)) {
        console.error(`❌ File not found: ${dataPath}`);
        process.exit(1);
    }

    const rawData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await supabase
        .from('season_archive')
        .upsert({ year: 2025, raw_data: rawData }, { onConflict: 'year' });

    if (error) {
        console.error('❌ Archive failed:', error.message);
        process.exit(1);
    }

    console.log(`✅ 2025 season archived (${Object.keys(rawData).length} top-level keys, ${rawData.substitutions?.length || 0} substitutions on record)`);
}

main();
