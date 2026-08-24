// _shared/swapStatus.ts
// Determines what kind of change (if any) is currently allowed for a locked
// duo slot:
//   - healthy-locked: still rostered, not injured - the lock holds, no override
//   - temporary: still rostered, genuinely injured - unlimited manual swaps as
//     long as the team still has manual privilege; auto-reverts once healthy
//   - permanent: no longer on the roster at all (traded/released) - no
//     auto-revert, capped at 2 manual picks per team per season
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

// Given the situation and the team's current swap state (read from the teams
// table - never mutated here, this is a pure read-time check), decides
// whether a manual pick should be offered right now. The actual counter
// increments happen in set-duo on a successful write, not here.
export function checkSwapPermission(
    situation: SwapSituation,
    manualPrivilege: boolean,
    permanentSwapsUsed: number
): SwapPermission {
    if (situation === 'healthy-locked') {
        return { allowed: false, reason: 'This slot is locked for the rest of the season.' };
    }

    if (!manualPrivilege) {
        return { allowed: false, reason: 'Manual swaps have been used up for this team - auto-sub fills gaps automatically from here on.' };
    }

    if (situation === 'permanent' && permanentSwapsUsed >= 1) {
        return {
            allowed: false,
            reason: 'This is your 2nd permanent swap of the season - auto-sub fills this one automatically, and manual swaps are now used up for the rest of the season.'
        };
    }

    return { allowed: true };
}
