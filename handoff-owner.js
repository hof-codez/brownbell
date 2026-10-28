// handoff-owner.js
// Hands a team to a new owner without losing the team's history.
// A team is the roster slot. Duos, scores, subs, standbys and bonus results all hang off
// the team row, so they stay. This script:
//   1. checks Sleeper really shows the new owner on that roster (changes nothing if not)
//   2. renames the team to the new owner and updates the Sleeper owner id
//   3. logs the old owner in manager_changes
//   4. clears the team's claim (old PIN and devices stop working)
//   5. archives the old owner's calculator votes (they keep counting in league values
//      and trade splits, but the new owner starts with a clean profile and daily cap)
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SLEEPER_LEAGUE_ID
//      ROSTER_ID (Sleeper roster number), NEW_USERNAME, CHANGE_WEEK
// Optional: REASON, DRY_RUN=true (prints the plan, writes nothing)
// Run: node handoff-owner.js

const { createClient } = require('@supabase/supabase-js');

const SLEEPER = 'https://api.sleeper.app/v1';
const need = (k) => {
    if (!process.env[k]) throw new Error(`Missing ${k}`);
    return process.env[k];
};

async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
}

async function main() {
    const leagueId = need('SLEEPER_LEAGUE_ID');
    const rosterId = String(need('ROSTER_ID'));
    const wanted = need('NEW_USERNAME').trim().toLowerCase();
    const changeWeek = Number(need('CHANGE_WEEK'));
    const reason = process.env.REASON || 'Team taken over by a new owner';
    const dry = process.env.DRY_RUN === 'true';
    if (!Number.isInteger(changeWeek) || changeWeek < 1) throw new Error('CHANGE_WEEK must be a week number');

    const [rosters, users] = await Promise.all([
        getJson(`${SLEEPER}/league/${leagueId}/rosters`),
        getJson(`${SLEEPER}/league/${leagueId}/users`),
    ]);
    const roster = rosters.find((r) => String(r.roster_id) === rosterId);
    if (!roster) throw new Error(`No roster ${rosterId} in the league`);
    const owner = users.find((u) => u.user_id === roster.owner_id);
    const ownerNames = owner ? [owner.username, owner.display_name].filter(Boolean).map((s) => s.toLowerCase()) : [];
    if (!owner || !ownerNames.includes(wanted)) {
        throw new Error(
            `Sleeper shows ${owner ? owner.display_name || owner.username : 'no one'} on roster ${rosterId}, not ${process.env.NEW_USERNAME}. ` +
            'Nothing was changed. Make the owner change in Sleeper first, then run this again.'
        );
    }
    const newName = owner.display_name || owner.username;

    const db = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const { data: season, error: sErr } = await db.from('seasons').select('id').eq('is_active', true)
        .order('year', { ascending: false }).limit(1).maybeSingle();
    if (sErr || !season) throw new Error('No active season');
    const { data: team, error: tErr } = await db.from('teams').select('id, display_name, sleeper_owner_id')
        .eq('season_id', season.id).eq('sleeper_roster_id', rosterId).maybeSingle();
    if (tErr || !team) throw new Error(`No team for roster ${rosterId} in the active season`);

    if (team.display_name === newName && team.sleeper_owner_id === owner.user_id) {
        console.log(`Roster ${rosterId} is already ${newName}. Nothing to do.`);
        return;
    }
    const { data: clash } = await db.from('teams').select('id').eq('season_id', season.id).eq('display_name', newName).neq('id', team.id);
    if (clash && clash.length) throw new Error(`Another team already uses the name ${newName}`);

    const previous = team.display_name;
    console.log(`Plan: roster ${rosterId} ${previous} -> ${newName} (owner id ${owner.user_id}), change week ${changeWeek}`);
    if (dry) {
        console.log('DRY_RUN: no changes written.');
        return;
    }

    // Order matters: log the old owner first, so a partial run never loses who it was.
    const { data: already } = await db.from('manager_changes').select('id')
        .eq('team_id', team.id).eq('previous_manager', previous).eq('change_week', changeWeek);
    if (!already || !already.length) {
        const { error } = await db.from('manager_changes').insert({
            team_id: team.id, previous_manager: previous, change_week: changeWeek, reason,
        });
        if (error) throw new Error(`manager_changes: ${error.message}`);
    }

    let r = await db.from('teams').update({ display_name: newName, sleeper_owner_id: owner.user_id }).eq('id', team.id);
    if (r.error) throw new Error(`teams: ${r.error.message}`);

    r = await db.from('team_claims').delete().eq('team_id', team.id);
    if (r.error) throw new Error(`team_claims: ${r.error.message}`);

    for (const table of ['tc_votes', 'tc_trade_votes']) {
        r = await db.from(table).update({ archived: true }).eq('team_id', team.id).eq('archived', false);
        if (r.error) throw new Error(`${table}: ${r.error.message} (is migration 041 applied?)`);
    }

    console.log(`Done. ${previous} is logged as the previous manager from week ${changeWeek}.`);
    console.log(`The new owner can claim ${newName} with a fresh PIN. Run Trade Calculator Seed to refresh the roster mapping.`);
}

main().catch((e) => {
    console.error('handoff failed:', e.message);
    process.exit(1);
});
