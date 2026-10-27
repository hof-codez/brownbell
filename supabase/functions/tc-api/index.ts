// tc-api: the one Edge Function behind the league trade calculator app.
// Actions: teams, me, values, ballot, vote.
// Auth reuses Brown Bell team claims: the app claims a team through the existing
// claim-team function, then sends the deviceToken it gets back with every call.
//
// Deploy:  supabase functions deploy tc-api --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { pickBallot } from './ballot.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function authTeam(deviceToken: unknown): Promise<{ id: string; name: string } | null> {
  if (typeof deviceToken !== 'string' || deviceToken.length < 8) return null;
  const { data: claim } = await db
    .from('team_claims')
    .select('team_id')
    .filter('device_tokens', 'cs', JSON.stringify([{ token: deviceToken }]))
    .maybeSingle();
  if (!claim) return null;
  const { data: team } = await db
    .from('teams')
    .select('id, display_name')
    .eq('id', claim.team_id)
    .maybeSingle();
  return team ? { id: team.id, name: team.display_name } : null;
}

// Small in-memory cache so a burst of ballots does not re-read the whole table.
let poolCache: { at: number; rows: any[] } | null = null;
async function loadPool() {
  if (poolCache && Date.now() - poolCache.at < 60_000) return poolCache.rows;
  const { data, error } = await db
    .from('tc_assets')
    .select('id, kind, name, position, nfl_team, age, pick_year, pick_round, rating, votes')
    .eq('rostered', true);
  if (error) throw error;
  poolCache = { at: Date.now(), rows: data ?? [] };
  return poolCache.rows;
}

function publicAsset(a: any) {
  return {
    id: a.id,
    kind: a.kind,
    name: a.name,
    position: a.position,
    team: a.nfl_team,
    age: a.age,
    pickYear: a.pick_year,
    pickRound: a.pick_round,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad JSON' }, 400);
  }
  const action = body?.action;

  try {
    // ---- teams: needed before a device can claim one -----------------------
    if (action === 'teams') {
      const { data: season } = await db
        .from('seasons')
        .select('id')
        .eq('is_active', true)
        .order('year', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!season) return json({ teams: [] });
      const { data: teams } = await db
        .from('teams')
        .select('id, display_name')
        .eq('season_id', season.id)
        .order('display_name');
      const { data: claims } = await db.from('team_claims').select('team_id');
      const claimed = new Set((claims ?? []).map((c: any) => c.team_id));
      return json({
        teams: (teams ?? []).map((t: any) => ({
          id: t.id,
          name: t.display_name,
          claimed: claimed.has(t.id),
        })),
      });
    }

    // everything below needs a claimed device
    const team = await authTeam(body?.deviceToken);
    if (!team) return json({ error: 'not_signed_in' }, 401);

    if (action === 'me') {
      const { data: left } = await db.rpc('tc_votes_left', { p_team: team.id });
      return json({ teamId: team.id, name: team.name, votesLeft: Math.max(0, left ?? 0) });
    }

    // ---- values: published ratings only ------------------------------------
    if (action === 'values') {
      // closes the voting window and publishes if it is due
      await db.rpc('tc_publish', { p_force: false });

      const { data: s } = await db.from('tc_settings').select('*').eq('id', 1).single();
      const { data: left } = await db.rpc('tc_votes_left', { p_team: team.id });
      const base = {
        version: s.version,
        windowEndsAt: s.window_ends_at,
        publishedAt: s.published_at,
        starPremium: Number(s.star_premium),
        maxVotesPerDay: s.max_votes_per_day,
        votesLeft: Math.max(0, left ?? 0),
      };
      if (body.since === s.version) return json({ ...base, unchanged: true });

      const { data: rows, error } = await db
        .from('tc_assets')
        .select('id, kind, name, position, nfl_team, age, pick_year, pick_round, published_rating')
        .eq('rostered', true)
        .order('published_rating', { ascending: false });
      if (error) throw error;
      return json({
        ...base,
        assets: (rows ?? []).map((a: any) => ({
          ...publicAsset(a),
          value: Math.round(a.published_rating),
        })),
      });
    }

    // ---- ballot: three assets, none of them the voter's own players --------
    if (action === 'ballot') {
      const { data: left } = await db.rpc('tc_votes_left', { p_team: team.id });
      if ((left ?? 0) <= 0) return json({ error: 'daily_limit', votesLeft: 0 }, 429);

      const { data: held } = await db.from('tc_holdings').select('asset_id').eq('team_id', team.id);
      const mine = new Set((held ?? []).map((h: any) => h.asset_id));
      const pool = (await loadPool()).filter((a) => !mine.has(a.id));
      const picked = pickBallot(pool);
      if (!picked) return json({ error: 'not_enough_assets' }, 409);
      return json({ votesLeft: left, assets: picked.map(publicAsset) });
    }

    // ---- vote ---------------------------------------------------------------
    if (action === 'vote') {
      const { keep, trade, cut } = body;
      if ([keep, trade, cut].some((x) => typeof x !== 'string')) {
        return json({ error: 'bad_request' }, 400);
      }
      if (new Set([keep, trade, cut]).size !== 3) return json({ error: 'bad_request' }, 400);
      const { data, error } = await db.rpc('tc_cast_vote', {
        p_team: team.id,
        p_keep: keep,
        p_trade: trade,
        p_cut: cut,
      });
      if (error) {
        const msg = error.message ?? '';
        if (msg.includes('daily_limit')) return json({ error: 'daily_limit', votesLeft: 0 }, 429);
        if (msg.includes('own_asset')) return json({ error: 'own_asset' }, 400);
        if (msg.includes('bad_assets')) return json({ error: 'bad_assets' }, 400);
        throw error;
      }
      poolCache = null;
      return json({ ok: true, votesLeft: data });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    console.error('tc-api error', e);
    return json({ error: 'server_error' }, 500);
  }
});
