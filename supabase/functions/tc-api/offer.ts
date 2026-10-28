// Builds made-up trade offers for the Offer Desk. Pure, no imports, testable outside Deno.
// An offer is two bundles: what the voter "receives" and what they "give". The sides
// are built to be close in value so the answer is a real judgment call.

export interface OfferCandidate {
  id: string;
  rating: number;
  votes: number;
}

export interface Offer {
  receive: string[];
  give: string[];
}

const adjusted = (rating: number, star: number) => 10000 * Math.pow(Math.max(0, rating) / 10000, 1 + star);

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

// How many assets go on the other side: 1-for-1, 2-for-1, or 3-for-1
function pickCount(rng: () => number): number {
  const r = rng();
  return r < 0.45 ? 1 : r < 0.85 ? 2 : 3;
}

export function buildOffer<T extends OfferCandidate>(
  pool: T[],
  star: number,
  rng: () => number = Math.random,
  tolerance = 0.22,
): Offer | null {
  if (pool.length < 4) return null;

  for (let attempt = 0; attempt < 12; attempt++) {
    // anchor: the single asset on one side. Favor assets with few votes.
    const anchor = weightedPick(pool, (a) => 1 / (1 + a.votes), rng);
    const target = adjusted(anchor.rating, star);
    const k = pickCount(rng);

    // candidates for the other side are individually worth less than the anchor
    // (when k > 1) or about the same (when k = 1)
    const cands = pool.filter((a) => {
      if (a.id === anchor.id) return false;
      const v = adjusted(a.rating, star);
      return k === 1 ? Math.abs(v - target) <= target * 0.5 : v < target * 0.95 && v > target * 0.12;
    });
    if (cands.length < k) continue;

    let best: T[] | null = null;
    let bestMiss = Infinity;
    for (let i = 0; i < 160; i++) {
      const chosen: T[] = [];
      const left = [...cands];
      while (chosen.length < k && left.length) {
        const c = weightedPick(left, (a) => 1 / (1 + a.votes), rng);
        chosen.push(c);
        left.splice(left.findIndex((x) => x.id === c.id), 1);
      }
      if (chosen.length < k) continue;
      const sum = chosen.reduce((s, a) => s + adjusted(a.rating, star), 0);
      const miss = Math.abs(sum - target) / target;
      if (miss < bestMiss) { bestMiss = miss; best = chosen; }
    }
    if (!best || bestMiss > tolerance) continue;

    const other = best.map((a) => a.id);
    // random side for the anchor so the single big asset is not always what you receive
    return rng() < 0.5 ? { receive: [anchor.id], give: other } : { receive: other, give: [anchor.id] };
  }
  return null;
}

// ---- signing: stops anyone from voting on an offer the server never made ----------

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

const payload = (teamId: string, receive: string[], give: string[], exp: number) =>
  `${teamId}|${[...receive].sort().join(',')}|${[...give].sort().join(',')}|${exp}`;

export async function signOffer(secret: string, teamId: string, o: Offer, ttlMs = 6 * 3600_000, now = Date.now()) {
  const exp = now + ttlMs;
  return { exp, sig: await hmac(secret, payload(teamId, o.receive, o.give, exp)) };
}

export async function verifyOffer(
  secret: string, teamId: string, o: Offer, exp: number, sig: string, now = Date.now(),
): Promise<boolean> {
  if (!Number.isFinite(exp) || exp < now || typeof sig !== 'string') return false;
  const expected = await hmac(secret, payload(teamId, o.receive, o.give, exp));
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
