// roster-departures/index.ts
// POST {} -> { asOf, departed: [{ teamId, awardType, playerIndex }] }
//
// Which duo slots currently hold a player who is NOT on that team's live Sleeper roster
// (traded or released). Read-only, no auth needed: it exposes nothing beyond what the app already
// shows (a flag on a slot). The automation only notices departures at its checkpoints, which left
// owners looking at traded-away players, with no Change button, for hours after a trade. The app
// calls this on load so the flag and the Change option are there right away. The real permission
// rules (one permanent swap per award, live roster check) still run in get-eligible-roster and
// set-duo, so this is a display hint, never a bypass.
//
// verify_jwt must be OFF for this function (see ../../config.toml).
// Self-contained on purpose (no ../_shared imports) so it deploys as a single file.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function serviceKey(): string {
    const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (legacy) return legacy;
    try {
        const map = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
        if (map.default) return map.default;
    } catch { /* fall through */ }
    throw new Error('No service-role key in environment');
}

const db = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), { auth: { persistSession: false } });

// 30 second cache so a burst of app loads shares one Sleeper call
let cache: { at: number; body: unknown } | null = null;

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    try {
        if (cache && Date.now() - cache.at < 30_000) return json(cache.body);

        const { data: season } = await db.from('seasons').select('id, sleeper_league_id')
            .eq('is_active', true).order('year', { ascending: false }).limit(1).maybeSingle();
        if (!season) return json({ asOf: new Date().toISOString(), departed: [] });

        const { data: teams } = await db.from('teams').select('id, sleeper_roster_id').eq('season_id', season.id);
        const teamIds = (teams ?? []).map((t: any) => t.id);
        if (!teamIds.length) return json({ asOf: new Date().toISOString(), departed: [] });

        const [{ data: duos }, res] = await Promise.all([
            db.from('duos').select('team_id, award_type, player_index, sleeper_player_id').in('team_id', teamIds),
            fetch(`https://api.sleeper.app/v1/league/${season.sleeper_league_id}/rosters`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrownBellApp/1.0)' },
            }),
        ]);
        if (!res.ok) return json({ error: 'sleeper_unavailable' }, 502);
        const rosters: Array<{ roster_id: number; players?: string[] }> = await res.json();
        if (!Array.isArray(rosters) || rosters.length === 0) return json({ error: 'sleeper_empty' }, 502);

        const rosterByTeam = new Map<string, Set<string>>();
        for (const t of teams ?? []) {
            const r = rosters.find((x) => String(x.roster_id) === String(t.sleeper_roster_id));
            if (r) rosterByTeam.set(t.id, new Set(r.players ?? []));
        }

        const departed: Array<{ teamId: string; awardType: string; playerIndex: number }> = [];
        for (const d of duos ?? []) {
            if (!d.sleeper_player_id) continue;
            const set = rosterByTeam.get(d.team_id);
            if (!set) continue; // no roster found for this team, never guess
            if (!set.has(d.sleeper_player_id)) {
                departed.push({ teamId: d.team_id, awardType: d.award_type, playerIndex: d.player_index });
            }
        }

        const body = { asOf: new Date().toISOString(), departed };
        cache = { at: Date.now(), body };
        return json(body);
    } catch (e) {
        console.error('roster-departures error:', e);
        return json({ error: 'server_error' }, 500);
    }
});
