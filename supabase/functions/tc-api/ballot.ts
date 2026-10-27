// Picks the three assets for one ballot. Pure function, no imports, so it can be
// tested outside Deno.

export interface BallotCandidate {
  id: string;
  rating: number;
  votes: number;
}

// Anchor favors assets with few votes. The other two sit close to the anchor in
// rating, because ranking a star against a scrub teaches us nothing.
export function pickBallot<T extends BallotCandidate>(
  pool: T[],
  rng: () => number = Math.random,
): T[] | null {
  if (pool.length < 3) return null;

  const anchor = weightedPick(pool, (a) => 1 / (1 + a.votes), rng);
  const rest = pool.filter((a) => a.id !== anchor.id);

  const band = Math.max(600, anchor.rating * 0.35);
  let near = rest.filter((a) => Math.abs(a.rating - anchor.rating) <= band);
  if (near.length < 2) {
    near = [...rest]
      .sort((a, b) => Math.abs(a.rating - anchor.rating) - Math.abs(b.rating - anchor.rating))
      .slice(0, Math.max(2, Math.min(6, rest.length)));
  }

  const second = weightedPick(near, (a) => 1 / (1 + a.votes), rng);
  const third = weightedPick(
    near.filter((a) => a.id !== second.id),
    (a) => 1 / (1 + a.votes),
    rng,
  );

  // shuffle so the anchor is not always first
  const out = [anchor, second, third];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function weightedPick<T>(items: T[], weight: (t: T) => number, rng: () => number): T {
  let total = 0;
  for (const it of items) total += weight(it);
  let r = rng() * total;
  for (const it of items) {
    r -= weight(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}
