// tc-api: the one Edge Function behind the league trade calculator app.
// Actions: teams, me, values, ballot, vote, league, desk, desk_vote, history, fit_data.
// Auth reuses Brown Bell team claims: the app claims a team through the existing
// claim-team function, then sends the deviceToken it gets back with every call.
//
// Deploy:  supabase functions deploy tc-api --no-verify-jwt

import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { pickBallot } from './ballot.ts';
import { buildOffer, signOffer, verifyOffer } from './offer.ts';
import { MIN_EARLY, MIN_SOLID, arizonaDayStart, buildProfile, groupRowsByTeam } from './profile.ts';

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
let leagueCache: { at: number; body: unknown } | null = null;
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

// The voter's own read, including votes cast today. Only ever returned to that voter.
async function selfPreview(teamId: string) {
  const { data, error } = await db.rpc('tc_vote_traits', {
    p_cutoff: new Date(Date.now() + 60_000).toISOString(),
    p_team: teamId,
  });
  if (error) throw error;
  const rows = groupRowsByTeam(data ?? []).get(teamId) ?? [];
  const profile = buildProfile(rows);
  const total = rows.find((r) => r.grp === '_all')?.n ?? 0;
  return { totalVotes: total, confidence: profile.confidence, traits: profile.traits, lean: profile.lean };
}

let settingsCache: { at: number; full: number; star: number } | null = null;
async function loadSettings() {
  if (settingsCache && Date.now() - settingsCache.at < 60_000) return settingsCache;
  const { data } = await db.from('tc_settings').select('full_weight_votes, star_premium').eq('id', 1).single();
  settingsCache = {
    at: Date.now(),
    full: data?.full_weight_votes ?? 5,
    star: Number(data?.star_premium ?? 0.3),
  };
  return settingsCache;
}
const fullWeightVotes = async () => (await loadSettings()).full;

const SIGNING_SECRET = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// One message per vote at most. Profile unlocks come first, then the weight note.
function milestoneFor(result: { votesLeft: number; dayVotes: number; totalVotes: number }, fullN: number) {
  if (result.totalVotes === MIN_EARLY) return 'early';
  if (result.totalVotes === MIN_SOLID) return 'solid';
  if (result.dayVotes === fullN && result.votesLeft > 0) return 'weight';
  return null;
}

function voteError(error: { message?: string }) {
  const msg = error.message ?? '';
  if (msg.includes('daily_limit')) return json({ error: 'daily_limit', votesLeft: 0 }, 429);
  if (msg.includes('own_asset')) return json({ error: 'own_asset' }, 400);
  if (msg.includes('bad_assets')) return json({ error: 'bad_assets' }, 400);
  if (msg.includes('already_voted')) return json({ error: 'already_voted' }, 409);
  if (msg.includes('bad_request')) return json({ error: 'bad_request' }, 400);
  return null;
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
      return json({
        teamId: team.id,
        name: team.name,
        votesLeft: Math.max(0, left ?? 0),
        preview: await selfPreview(team.id),
      });
    }

    // ---- league: every roster plus each owner's voting profile ---------------
    // Traits only. Raw votes never leave the database, and profiles use votes from
    // before today (Arizona time), so they move once a day.
    if (action === 'league') {
      if (leagueCache && Date.now() - leagueCache.at < 5 * 60_000) return json(leagueCache.body);

      const { data: season } = await db
        .from('seasons').select('id').eq('is_active', true)
        .order('year', { ascending: false }).limit(1).maybeSingle();
      if (!season) return json({ teams: [] });
      const { data: teams } = await db
        .from('teams').select('id, display_name').eq('season_id', season.id).order('display_name');
      const ids = (teams ?? []).map((t: any) => t.id);
      const { data: held } = await db.from('tc_holdings').select('asset_id, team_id').in('team_id', ids);
      const roster = new Map<string, string[]>();
      for (const h of held ?? []) {
        const list = roster.get(h.team_id) ?? [];
        list.push(h.asset_id);
        roster.set(h.team_id, list);
      }

      const cutoff = arizonaDayStart().toISOString();
      const { data: stats, error: statsErr } = await db.rpc('tc_vote_traits', { p_cutoff: cutoff });
      if (statsErr) throw statsErr;
      const byTeam = groupRowsByTeam(stats ?? []);

      const out = {
        teams: (teams ?? []).map((t: any) => {
          const profile = buildProfile(byTeam.get(t.id) ?? []);
          return {
            teamId: t.id,
            name: t.display_name,
            roster: roster.get(t.id) ?? [],
            confidence: profile.confidence,
            traits: profile.traits,
            lean: profile.lean,
          };
        }),
      };
      leagueCache = { at: Date.now(), body: out };
      return json(out);
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
        fullWeightVotes: s.full_weight_votes,
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
        const known = voteError(error);
        if (known) return known;
        throw error;
      }
      poolCache = null;
      const result = data as { votesLeft: number; dayVotes: number; weight: number; totalVotes: number };
      return json({
        ok: true,
        votesLeft: result.votesLeft,
        dayVotes: result.dayVotes,
        weight: result.weight,
        milestone: milestoneFor(result, await fullWeightVotes()),
        preview: await selfPreview(team.id),
      });
    }

    // ---- desk: the next thing to judge. Mostly made-up offers, sometimes a real trade ----
    if (action === 'desk') {
      const { data: left } = await db.rpc('tc_votes_left', { p_team: team.id });
      if ((left ?? 0) <= 0) return json({ error: 'daily_limit', votesLeft: 0 }, 429);

      const pool = await loadPool();
      const byId = new Map(pool.map((a: any) => [a.id, a]));
      const shape = (ids: string[]) => ids.map((id) => byId.get(id)).filter(Boolean).map(publicAsset);

      if (Math.random() < 0.25) {
        const { data: real } = await db.rpc('tc_next_real_trade', { p_team: team.id });
        const t = Array.isArray(real) ? real[0] : real;
        if (t) {
          return json({
            kind: 'real',
            id: t.id,
            year: new Date(t.happened_at).getUTCFullYear(),
            aGave: shape(t.side_a),
            bGave: shape(t.side_b),
            votesLeft: left,
          });
        }
      }

      const { data: held } = await db.from('tc_holdings').select('asset_id').eq('team_id', team.id);
      const mine = new Set((held ?? []).map((h: any) => h.asset_id));
      const { star } = await loadSettings();
      const offer = buildOffer(pool.filter((a: any) => !mine.has(a.id)), star);
      if (!offer) return json({ error: 'not_enough_assets' }, 409);
      const { exp, sig } = await signOffer(SIGNING_SECRET, team.id, offer);
      return json({
        kind: 'offer',
        receive: shape(offer.receive),
        give: shape(offer.give),
        exp,
        sig,
        votesLeft: left,
      });
    }

    if (action === 'desk_vote') {
      const kind = body.kind;
      let x: string[];
      let y: string[];
      let outcome: number;
      let realId: string | null = null;

      if (kind === 'offer') {
        const receive = body.receive, give = body.give;
        if (![receive, give].every((l) => Array.isArray(l) && l.every((v: unknown) => typeof v === 'string'))) {
          return json({ error: 'bad_request' }, 400);
        }
        if (!(await verifyOffer(SIGNING_SECRET, team.id, { receive, give }, Number(body.exp), body.sig))) {
          return json({ error: 'offer_expired' }, 400);
        }
        outcome = ({ accept: 1, even: 0, decline: -1 } as Record<string, number>)[body.outcome];
        x = receive;
        y = give;
      } else if (kind === 'real') {
        if (typeof body.id !== 'string') return json({ error: 'bad_request' }, 400);
        const { data: t } = await db.from('tc_real_trades').select('side_a, side_b').eq('id', body.id).maybeSingle();
        if (!t) return json({ error: 'bad_assets' }, 400);
        outcome = ({ a: 1, even: 0, b: -1 } as Record<string, number>)[body.outcome];
        x = t.side_b; // what Team A received
        y = t.side_a; // what Team A gave
        realId = body.id;
      } else {
        return json({ error: 'bad_request' }, 400);
      }
      if (outcome === undefined) return json({ error: 'bad_request' }, 400);

      const { data, error } = await db.rpc('tc_cast_trade_vote', {
        p_team: team.id, p_kind: kind, p_x: x, p_y: y, p_outcome: outcome, p_real_id: realId,
      });
      if (error) {
        const known = voteError(error);
        if (known) return known;
        throw error;
      }
      poolCache = null;
      const result = data as { votesLeft: number; dayVotes: number; weight: number; totalVotes: number; split: unknown };
      return json({
        ok: true,
        votesLeft: result.votesLeft,
        dayVotes: result.dayVotes,
        weight: result.weight,
        milestone: milestoneFor(result, await fullWeightVotes()),
        preview: await selfPreview(team.id),
        split: result.split ?? null,
      });
    }

    // ---- fit_data: what the calculator needs to estimate lineup fit ----------
    // Slots, week range, and per-player points per game, injury and bye. Small (one row per
    // tracked player), and only changes when the daily seed runs.
    if (action === 'fit_data') {
      const [{ data: s }, { data: season }, { data: rows, error }] = await Promise.all([
        db.from('tc_settings').select('lineup_slots, last_regular_week').eq('id', 1).single(),
        db.from('seasons').select('current_week').eq('is_active', true).order('year', { ascending: false }).limit(1).maybeSingle(),
        db.from('tc_player_status').select('asset_id, ppg, games, injury_status, bye_week'),
      ]);
      if (error) throw error;
      const players: Record<string, { ppg: number | null; games: number; inj: string | null; bye: number | null }> = {};
      for (const r of rows ?? []) {
        players[r.asset_id] = { ppg: r.ppg === null ? null : Number(r.ppg), games: r.games, inj: r.injury_status, bye: r.bye_week };
      }
      return json({
        slots: s?.lineup_slots ?? [],
        lastWeek: s?.last_regular_week ?? 14,
        currentWeek: season?.current_week ?? 1,
        players,
      });
    }

    // ---- history: league trades with the owners' current consensus ----------------
    // The read comes from how owners voted on each trade, not from the numbers. It is a live
    // view that can change as votes arrive. Only counts leave the database, never who voted.
    if (action === 'history') {
      const { data: trades, error: tErr } = await db
        .from('tc_real_trades')
        .select('id, happened_at, side_a, side_b, team_a, team_b')
        .order('happened_at', { ascending: false })
        .limit(60);
      if (tErr) throw tErr;
      const list = trades ?? [];
      const tradeIds = list.map((t: any) => t.id);

      const assetIds = [...new Set(list.flatMap((t: any) => [...t.side_a, ...t.side_b]))];
      const teamIds = [...new Set(list.flatMap((t: any) => [t.team_a, t.team_b]).filter(Boolean))];
      const [{ data: assets }, { data: teamRows }, { data: votes }, { data: held }] = await Promise.all([
        assetIds.length
          ? db.from('tc_assets').select('id, kind, name, position, pick_year, pick_round, rostered').in('id', assetIds)
          : Promise.resolve({ data: [] as any[] }),
        teamIds.length
          ? db.from('teams').select('id, display_name').in('id', teamIds)
          : Promise.resolve({ data: [] as any[] }),
        tradeIds.length
          ? db.from('tc_trade_votes').select('real_trade_id, team_id, outcome, archived').in('real_trade_id', tradeIds)
          : Promise.resolve({ data: [] as any[] }),
        db.from('tc_holdings').select('asset_id').eq('team_id', team.id),
      ]);
      const aById = new Map((assets ?? []).map((a: any) => [a.id, a]));
      const tName = new Map((teamRows ?? []).map((t: any) => [t.id, t.display_name]));
      const mineHeld = new Set((held ?? []).map((h: any) => h.asset_id));

      const split = new Map<string, { aWon: number; even: number; bWon: number; total: number }>();
      const myVote = new Map<string, number>();
      for (const v of votes ?? []) {
        const sp = split.get(v.real_trade_id) ?? { aWon: 0, even: 0, bWon: 0, total: 0 };
        if (v.outcome === 1) sp.aWon++; else if (v.outcome === 0) sp.even++; else sp.bWon++;
        sp.total++;
        split.set(v.real_trade_id, sp);
        if (v.team_id === team.id && !v.archived) myVote.set(v.real_trade_id, v.outcome);
      }

      const shape = (ids: string[]) =>
        ids.map((id) => aById.get(id)).filter(Boolean).map((a: any) => ({
          id: a.id, name: a.name, position: a.position, pickYear: a.pick_year, pickRound: a.pick_round,
        }));

      return json({
        trades: list.map((t: any) => {
          const all = [...t.side_a, ...t.side_b];
          const tracked = all.every((id: string) => aById.get(id)?.rostered);
          const involved = t.team_a === team.id || t.team_b === team.id;
          const mineIn = all.some((id: string) => mineHeld.has(id));
          return {
            id: t.id,
            happenedAt: t.happened_at,
            teamA: { id: t.team_a, name: tName.get(t.team_a) ?? 'Unknown team', gave: shape(t.side_a) },
            teamB: { id: t.team_b, name: tName.get(t.team_b) ?? 'Unknown team', gave: shape(t.side_b) },
            split: split.get(t.id) ?? { aWon: 0, even: 0, bWon: 0, total: 0 },
            mine: myVote.has(t.id) ? myVote.get(t.id) : null,
            canVote: tracked && !involved && !mineIn && !myVote.has(t.id),
          };
        }),
      });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    console.error('tc-api error', e);
    return json({ error: 'server_error' }, 500);
  }
});
