// _shared/swapStatus.ts
// Determines what kind of change (if any) is currently allowed for a locked
// duo slot:
//   - healthy-locked: still rostered, not injured - the lock holds, no override
//   - temporary: still rostered, genuinely injured - unlimited manual swaps as
//     long as this AWARD hasn't used its permanent swap yet; auto-reverts
//     once healthy
//   - permanent: no longer on the roster at all (traded/released) - one
//     manual pick per team PER AWARD per season, independent of the other
//     two awards
//
// Independent per award: a permanent departure in Brown Bell doesn't touch
// Next Up's or Season of Boom's budget, and vice versa - one award has
// nothing to do with another.
//
// Always determined from live Sleeper data - never trusted from the client.
// Both get-eligible-roster and set-duo use this so what the picker shows and
// what set-duo actually enforces can never drift apart.

import type { SleeperPlayer } from './sleeper.ts';

export type SwapSituation = 'healthy-locked' | 'temporary' | 'temporary-long-term' | 'permanent';

const QUALIFYING_INJURY_STATUSES = new Set(['out', 'doubtful', 'ir', 'pup']);
// IR/PUP specifically - unlike out/doubtful, a player physically on IR
// or PUP cannot be activated mid-week under NFL rules at all, so
// there's zero risk of them surprising everyone by playing that same
// week. That's the actual distinction that matters for whether Change
// is safe to offer, not just how long the designation happens to last.
const LONG_TERM_INJURY_STATUSES = new Set(['ir', 'pup']);

export function classifySwapSituation(
    currentPlayerSleeperId: string | null,
    rosterPlayerIds: string[],
    allPlayers: Record<string, SleeperPlayer>
): SwapSituation {
    if (!currentPlayerSleeperId) return 'healthy-locked'; // no current occupant to evaluate - fail safe, no override

    if (!rosterPlayerIds.includes(currentPlayerSleeperId)) {
        return 'permanent'; // no longer on the roster at all - traded or released
    }

    const status = (allPlayers[currentPlayerSleeperId]?.injury_status || '').toLowerCase();
    if (LONG_TERM_INJURY_STATUSES.has(status)) {
        return 'temporary-long-term';
    }
    if (QUALIFYING_INJURY_STATUSES.has(status)) {
        return 'temporary';
    }

    return 'healthy-locked'; // still rostered, not flagged injured - locking holds
}

export interface SwapPermission {
    allowed: boolean;
    reason?: string;
}

// permanentSwapUsed is THIS AWARD's own flag (main/nextup/boom each track
// their own) - not a team-wide value. Given the current situation and
// whether this specific award has already used its one permanent swap,
// decides whether a manual pick should be offered right now. The actual
// flag update happens in set-duo on a successful write, not here.
export function checkSwapPermission(
    situation: SwapSituation,
    permanentSwapUsed: boolean
): SwapPermission {
    if (situation === 'healthy-locked') {
        return { allowed: false, reason: 'This slot is locked for the rest of the season.' };
    }

    // Standby is now the primary tool for a temporary situation, not
    // Change - a manual swap here would otherwise override the original
    // player even if they end up playing after all, which defeats the
    // entire point of locking a duo in at season start. Standby only
    // ever activates if the original is genuinely ruled out, so it's the
    // only tool offered while that's still uncertain.
    if (situation === 'temporary') {
        return { allowed: false, reason: 'This is a temporary situation - set a standby instead to choose who replaces this player if they’re ruled out. Change only applies once a player is off the roster for good.' };
    }

    if (permanentSwapUsed) {
        return { allowed: false, reason: 'This award\u2019s manual swap has already been used this season - auto-sub fills any further gaps for it automatically.' };
    }

    return { allowed: true };
}
