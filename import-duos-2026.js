// import-duos-2026.js
// One-time import of the duo picks owners already submitted via group chat.
//
// Matches each submitted name against that SPECIFIC owner's current Sleeper
// roster - not the whole ~5000-player NFL database. This does two things at
// once: it eliminates almost all name ambiguity (a name is far less likely to
// collide within one 15-20 player roster than across the whole league), and
// it validates that the player is actually rostered by that owner right now -
// a real correctness check a whole-database match can't give you.
//
// Never hardcodes a player_id - always resolves live against real data.
// Anything ambiguous, unmatched, or not on that team's roster is reported,
// not guessed - a wrong assignment on a live tracker is worse than a slot
// staying empty one more day.
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... SLEEPER_LEAGUE_ID=... node import-duos-2026.js

const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// ============================================================================
// PICKS AS SUBMITTED - team names are the real Sleeper display names (already
// cross-referenced against the group chat's nicknames). `null` means pending/
// not yet submitted - those slots are skipped, not guessed.
//
// A couple of known typos from the source messages are corrected here directly
// (noted inline) rather than relying on the matcher to guess through them.
// ============================================================================
const PICKS = [
    {
        team: '713Born501Raised',
        main: ['Trevor Lawrence', 'Dalton Kincaid'],
        nextup: ['RJ Harvey', 'Rome Odunze']
    },
    {
        team: 'Kenyatta93',
        main: ['AJ Brown', 'Saquon Barkley'],
        nextup: ['Ladd McConkey', null] // second player "undetermined"
    },
    {
        team: 'Dcastro90',
        main: ['Jahmyr Gibbs', 'Justin Herbert'],
        nextup: ['Oronde Gadsden', "De'Zhaun Stribling"]
    },
    {
        team: 'Justin274447',
        main: ["De'Von Achane", "Ja'Marr Chase"],
        nextup: ['Drake Maye', 'Zachariah Branch']
    },
    {
        team: 'HofDimez',
        main: ['Puka Nacua', 'Christian McCaffrey'], // "McCaffery" corrected
        nextup: ['Makai Lemon', 'Jaxson Dart'] // "Lemon & Dart" resolved
    },
    {
        team: 'Un14wfulBandit', // Tyrone / "Repeat Offenders"
        main: ['Bijan Robinson', 'Amon-Ra St. Brown'],
        nextup: ['Ashton Jeanty', 'Bo Nix']
    },
    {
        team: 'fsmrubix', // Johnny / "Full Send"
        main: ['Jonathan Taylor', 'CeeDee Lamb'], // "Jonathon" corrected
        nextup: ['Jayden Daniels', 'Jeremiyah Love']
    },
    {
        team: 'ZayJones23', // Xavier / "Boutte Time"
        main: ['Kyler Murray', 'Tony Pollard'],
        nextup: [null, null] // "pending"
    },
    {
        team: 'KnowItAllJankyJew', // Casey / "Molly Whoppers"
        main: ['Jordan Love', 'Rashee Rice'],
        nextup: ['Brock Bowers', 'Quinshon Judkins']
    },
    {
        team: 'MikeLarry25',
        main: ['Kenneth Walker', 'George Pickens'], // roster-scoped match resolves this alone now
        nextup: ['Caleb Williams', 'Omar Cooper'] // owner swapped out Malik Washington
    },
    { team: 'Ch3r0k33zY', main: [null, null], nextup: [null, null] }, // awaiting submission
    { team: 'mibues', main: [null, null], nextup: [null, null] } // awaiting submission
];

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);

function fetchJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrownBellImport/1.0)' } }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function normalizeName(name) {
    return name
        .toLowerCase()
        .replace(/[.'']/g, '')
        .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Rule matches the one baked into update-standings.js's isNextUpEligibleExperience /
// isValidNextUpCombo - kept in sync manually since this is a standalone one-time
// script, not a shared module. Both years of experience AND position must differ.
function isNextUpEligibleExperience(yearsExp) {
    const exp = yearsExp || 0;
    return exp >= 0 && exp <= 3;
}

function isValidNextUpCombo(a, b) {
    if (!isNextUpEligibleExperience(a.years) || !isNextUpEligibleExperience(b.years)) return false;
    if (a.years === b.years) return false;
    if (a.position === b.position) return false;
    return true;
}

// Builds a normalized-name -> [player_id, ...] index scoped to ONE team's
// actual current roster, not the whole league. Sharply reduces ambiguity and
// means a match also proves the player is really on that owner's roster.
function buildRosterIndex(rosterPlayerIds, allPlayers) {
    const byFullName = new Map();
    const byFirstName = new Map();

    for (const playerId of rosterPlayerIds) {
        const p = allPlayers[playerId];
        if (!p || !p.position || !SKILL_POSITIONS.has(p.position)) continue;
        if (!p.first_name || !p.last_name) continue;

        const full = normalizeName(`${p.first_name} ${p.last_name}`);
        if (!byFullName.has(full)) byFullName.set(full, []);
        byFullName.get(full).push(playerId);

        const first = normalizeName(p.first_name);
        if (!byFirstName.has(first)) byFirstName.set(first, []);
        byFirstName.get(first).push(playerId);
    }

    return { byFullName, byFirstName };
}

async function main() {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SLEEPER_LEAGUE_ID } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SLEEPER_LEAGUE_ID) {
        console.error('❌ Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SLEEPER_LEAGUE_ID env vars');
        process.exit(1);
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log('📡 Fetching live Sleeper player database (this is a few MB, give it a moment)...');
    const allPlayers = await fetchJson('https://api.sleeper.app/v1/players/nfl');

    console.log('📡 Fetching current league rosters...');
    const [rosters, users] = await Promise.all([
        fetchJson(`https://api.sleeper.app/v1/league/${SLEEPER_LEAGUE_ID}/rosters`),
        fetchJson(`https://api.sleeper.app/v1/league/${SLEEPER_LEAGUE_ID}/users`)
    ]);

    const displayNameByOwnerId = {};
    users.forEach(u => { displayNameByOwnerId[u.user_id] = u.display_name || u.username; });

    const rosterPlayerIdsByTeam = {};
    rosters.forEach(r => {
        const teamName = displayNameByOwnerId[r.owner_id];
        if (teamName) rosterPlayerIdsByTeam[teamName] = new Set(r.players || []);
    });

    const unmatched = [];
    const notOnRoster = [];
    const ambiguous = [];
    const resolvedRows = [];
    const pendingSlots = [];

    function resolveOne(team, awardType, playerIndex, rawName) {
        if (!rawName) {
            pendingSlots.push(`${team} / ${awardType} / slot ${playerIndex}`);
            return;
        }

        const rosterPlayerIds = rosterPlayerIdsByTeam[team];
        if (!rosterPlayerIds) {
            unmatched.push({ team, awardType, playerIndex, rawName, reason: `no Sleeper roster found for team "${team}"` });
            return;
        }

        // Optional disambiguation hint: "Some Name (KC)" - the team code in
        // parens narrows a same-name collision without ever hand-typing a
        // player_id. Kept as a fallback; roster-scoping resolves almost
        // everything on its own now.
        const teamHintMatch = rawName.match(/^(.+?)\s*\(([A-Z]{2,4})\)\s*$/);
        const nameOnly = teamHintMatch ? teamHintMatch[1] : rawName;
        const teamHint = teamHintMatch ? teamHintMatch[2] : null;

        const { byFullName, byFirstName } = buildRosterIndex(rosterPlayerIds, allPlayers);
        const normalized = normalizeName(nameOnly);
        let candidates = byFullName.get(normalized);

        if (!candidates || candidates.length === 0) {
            candidates = byFirstName.get(normalized);
        }

        if (!candidates || candidates.length === 0) {
            notOnRoster.push({ team, awardType, playerIndex, rawName });
            return;
        }

        if (candidates.length > 1 && teamHint) {
            const narrowed = candidates.filter(id => allPlayers[id].team === teamHint);
            if (narrowed.length === 1) candidates = narrowed;
        }

        if (candidates.length > 1) {
            ambiguous.push({
                team, awardType, playerIndex, rawName,
                candidates: candidates.map(id => `${allPlayers[id].first_name} ${allPlayers[id].last_name} (${allPlayers[id].team || 'FA'}, ${allPlayers[id].position})`)
            });
            return;
        }

        const playerId = candidates[0];
        const p = allPlayers[playerId];
        resolvedRows.push({
            team, awardType, playerIndex, playerId,
            playerName: `${p.first_name} ${p.last_name}`,
            position: p.position,
            yearsExp: p.years_exp
        });
    }

    for (const pick of PICKS) {
        pick.main.forEach((name, i) => resolveOne(pick.team, 'main', i, name));
        pick.nextup.forEach((name, i) => resolveOne(pick.team, 'nextup', i, name));
    }

    // Sanity-check Next Up combos against the actual eligibility rule
    const nextUpWarnings = [];
    for (const pick of PICKS) {
        const rows = resolvedRows.filter(r => r.team === pick.team && r.awardType === 'nextup');
        if (rows.length !== 2) continue; // incomplete duo, already reported as pending
        const [a, b] = rows.sort((x, y) => x.playerIndex - y.playerIndex)
            .map(r => ({ years: r.yearsExp || 0, position: r.position }));
        const valid = isValidNextUpCombo(a, b);
        if (!valid) {
            nextUpWarnings.push(`${pick.team}: Next Up combo is ${a.years}yr ${a.position} + ${b.years}yr ${b.position} - must differ in both experience years and position, both must be 0-3 yrs`);
        }
    }

    console.log(`\n✅ Resolved ${resolvedRows.length} players`);
    console.log(`⏳ ${pendingSlots.length} slots pending (not submitted yet or unresolved names)`);
    console.log(`🚫 ${notOnRoster.length} names don't match anyone on that team's current Sleeper roster`);
    console.log(`❓ ${unmatched.length} names couldn't be checked at all (no roster found)`);
    console.log(`⚠️ ${ambiguous.length} names matched more than one player on the same roster`);
    console.log(`🚨 ${nextUpWarnings.length} Next Up combos fail the eligibility rule`);

    if (notOnRoster.length > 0) {
        console.log('\n--- NOT ON THAT TEAM\'S ROSTER (typo, already dropped/traded, or wrong owner?) ---');
        notOnRoster.forEach(u => console.log(`  ${u.team} / ${u.awardType} / slot ${u.playerIndex}: "${u.rawName}"`));
    }

    if (unmatched.length > 0) {
        console.log('\n--- COULD NOT CHECK (team name mismatch vs Sleeper) ---');
        unmatched.forEach(u => console.log(`  ${u.team} / ${u.awardType} / slot ${u.playerIndex}: "${u.rawName}" - ${u.reason}`));
    }

    if (ambiguous.length > 0) {
        console.log('\n--- AMBIGUOUS (same name appears twice on this roster - use the "(TEAM)" hint) ---');
        ambiguous.forEach(a => {
            console.log(`  ${a.team} / ${a.awardType} / slot ${a.playerIndex}: "${a.rawName}"`);
            a.candidates.forEach(c => console.log(`      - ${c}`));
        });
    }

    if (nextUpWarnings.length > 0) {
        console.log('\n--- NEXT UP ELIGIBILITY WARNINGS (submitted picks may need owner follow-up) ---');
        nextUpWarnings.forEach(w => console.log(`  ${w}`));
    }

    if (pendingSlots.length > 0) {
        console.log('\n--- PENDING (not written, no data to write) ---');
        pendingSlots.forEach(p => console.log(`  ${p}`));
    }

    if (resolvedRows.length === 0) {
        console.log('\nNothing resolved to write - stopping before touching Supabase.');
        return;
    }

    const { data: season, error: seasonError } = await supabase
        .from('seasons').select('id').eq('year', 2026).maybeSingle();
    if (seasonError || !season) {
        console.error('❌ Could not find the 2026 season row - run seed-2026-season.js first');
        process.exit(1);
    }

    const { data: teams, error: teamsError } = await supabase
        .from('teams').select('id, display_name').eq('season_id', season.id);
    if (teamsError) {
        console.error('❌ Failed to load teams:', teamsError.message);
        process.exit(1);
    }
    const teamIdByName = {};
    teams.forEach(t => { teamIdByName[t.display_name] = t.id; });

    const rowsToWrite = resolvedRows
        .map(r => {
            const teamId = teamIdByName[r.team];
            if (!teamId) {
                console.warn(`⚠️ No team found in Supabase named "${r.team}" - skipping this row`);
                return null;
            }
            return {
                team_id: teamId,
                award_type: r.awardType,
                player_index: r.playerIndex,
                player_name: r.playerName,
                player_position: r.position,
                sleeper_player_id: r.playerId
            };
        })
        .filter(Boolean);

    console.log(`\n📝 Writing ${rowsToWrite.length} duo rows to Supabase...`);
    const { error: upsertError } = await supabase
        .from('duos')
        .upsert(rowsToWrite, { onConflict: 'team_id,award_type,player_index' });

    if (upsertError) {
        console.error('❌ Failed to write duos:', upsertError.message);
        process.exit(1);
    }

    console.log('✅ Import complete.');
}

main().catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
});
