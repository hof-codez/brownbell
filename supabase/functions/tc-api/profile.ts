// Turns per-group vote stats into an owner's voting profile. Pure, no imports.
// Input rows come from tc_vote_traits(): one row per (team, group) with the number of
// times the group appeared and the summed gap between how the owner ranked it and how
// the league's published ratings rank it (positive = owner likes it more than consensus).

export interface TraitRow {
  team_id: string;
  grp: string;
  n: number;
  resid: number;
}

export type Confidence = 'none' | 'early' | 'solid';

export interface Trait {
  key: string;
  label: string;
  detail: string;
}

export interface VotingProfile {
  confidence: Confidence;
  traits: Trait[];
  // lean per group, scaled to -1..1 for the bars. Missing groups are left out.
  lean: Record<string, number>;
}

export const MIN_EARLY = 10;
export const MIN_SOLID = 25;
const SHRINK = 4; // pulls small samples toward zero
const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

const clamp = (x: number) => Math.max(-1, Math.min(1, x));

export function buildProfile(rows: TraitRow[]): VotingProfile {
  // '_all' counts every vote of any kind. '_votes' is ballots only and carries how often
  // the owner ranked three assets exactly like the league did.
  const votesRow = rows.find((r) => r.grp === '_votes');
  const votes = rows.find((r) => r.grp === '_all')?.n ?? votesRow?.n ?? 0;
  if (votes < MIN_EARLY) return { confidence: 'none', traits: [], lean: {} };
  const confidence: Confidence = votes >= MIN_SOLID ? 'solid' : 'early';

  const lean: Record<string, number> = {};
  const count: Record<string, number> = {};
  for (const r of rows) {
    if (r.grp === '_votes' || r.grp === '_all') continue;
    count[r.grp] = r.n;
    // a group's gap is at most 2 per appearance, so /2 keeps the bar inside -1..1
    lean[r.grp] = clamp(r.resid / (r.n + SHRINK) / 2);
  }

  const traits: Trait[] = [];
  const has = (g: string, min = 6) => (count[g] ?? 0) >= min;

  // age
  const young = has('young') ? lean.young : 0;
  const vet = has('vet') ? lean.vet : 0;
  if (young >= 0.1 && young >= vet) {
    traits.push({ key: 'youth', label: 'Youth-focused', detail: 'Ranks young players above where the league does.' });
  } else if (vet >= 0.1) {
    traits.push({ key: 'vets', label: 'Win-now', detail: 'Ranks proven veterans above where the league does.' });
  }

  // picks
  if (has('pick', 5)) {
    if (lean.pick >= 0.1) traits.push({ key: 'pick-lover', label: 'Pick lover', detail: 'Values draft picks more than the league does.' });
    else if (lean.pick <= -0.1) traits.push({ key: 'pick-skeptic', label: 'Pick skeptic', detail: 'Values draft picks less than the league does.' });
  }

  // positions: the strongest one or two
  const posLeans = POSITIONS.filter((p) => has(p)).map((p) => ({ p, v: lean[p] }));
  posLeans.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  for (const { p, v } of posLeans.slice(0, 2)) {
    if (v >= 0.12) traits.push({ key: `likes-${p}`, label: `Likes ${p}s`, detail: `Ranks ${p}s above where the league does.` });
    else if (v <= -0.12) traits.push({ key: `fades-${p}`, label: `Fades ${p}s`, detail: `Ranks ${p}s below where the league does.` });
  }

  // how they judge many-for-one and one-for-many trades
  const consolidate = has('consolidate', 5) ? lean.consolidate : 0;
  const spread = has('spread', 5) ? lean.spread : 0;
  if (consolidate >= 0.1 && consolidate >= spread) {
    traits.push({ key: 'consolidator', label: 'Consolidator', detail: 'Likes turning several good players into one star.' });
  } else if (spread >= 0.1) {
    traits.push({ key: 'depth-builder', label: 'Depth builder', detail: 'Likes getting several players for one star.' });
  }

  // consensus (ballots only, needs enough of them to mean something)
  if (votesRow && votesRow.n >= 8) {
    const rate = votesRow.resid / votesRow.n; // share of ballots ranked exactly like the league
    if (rate >= 0.4) traits.push({ key: 'consensus', label: 'Follows the league', detail: 'Usually ranks assets the way the league does.' });
    else if (rate <= 0.08) traits.push({ key: 'contrarian', label: 'Contrarian', detail: 'Rarely ranks assets the way the league does.' });
  }

  return { confidence, traits, lean };
}

export function groupRowsByTeam(rows: TraitRow[]): Map<string, TraitRow[]> {
  const out = new Map<string, TraitRow[]>();
  for (const r of rows) {
    const row = { ...r, n: Number(r.n), resid: Number(r.resid) };
    const list = out.get(r.team_id) ?? [];
    list.push(row);
    out.set(r.team_id, list);
  }
  return out;
}

// Arizona has no daylight saving (UTC-7). Profiles only use votes from before the
// start of the current Arizona day, so they change once a day and cannot be used
// to read a single fresh ballot.
export function arizonaDayStart(now: Date = new Date()): Date {
  const offsetMs = 7 * 3600_000;
  const local = now.getTime() - offsetMs;
  const startLocal = Math.floor(local / 86_400_000) * 86_400_000;
  return new Date(startLocal + offsetMs);
}
