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

export type SwapSituation = 'healthy-locked' | 'temporary' | 'permanent';

const QUALIFYING_INJURY_STATUSES = new Set(['out', 'doubtful', 'ir', 'pup']);

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

    if (permanentSwapUsed) {
        return { allowed: false, reason: 'This award\u2019s manual swap has already been used this season - auto-sub fills any further gaps for it automatically.' };
    }

    return { allowed: true };
}
