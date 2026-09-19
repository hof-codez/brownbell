// lib/isLastGameOfWeek.ts
// Whether a given NFL team's game is the LAST one of the week -
// deliberately not "is this a Monday" (which gets genuinely messy once a
// kickoff crosses midnight UTC), but the actual structural condition
// this matters for: does nothing else this week kick off later. This is
// exactly why the normal auto-sub rule (a replacement's own game must
// kick off at the same time or later than the player being replaced -
// see update-standings.js's selectAutoReplacement) can find no eligible
// candidate at all when the duo member's own game is this one - see the
// standby substitute feature, 033-standby-substitutes.sql.
//
// Mirrors set-standby's own server-side check exactly (same reasoning,
// same Date-comparison approach) - kept in two places since one runs in
// the browser and one in a Deno Edge Function, same pattern as
// _shared/eligibility.ts mirroring update-standings.js's combo rules.

import type { NFLGameInfo } from '../types';

export function isLastGameOfWeek(scheduleByTeam: Map<string, NFLGameInfo>, nflTeam: string | null): boolean {
    if (!nflTeam) return false;

    const allKickoffs = [...scheduleByTeam.values()]
        .map(g => g.kickoff_time)
        .filter((t): t is string => !!t)
        .map(t => new Date(t).getTime());
    if (allKickoffs.length === 0) return false;

    const latestKickoff = Math.max(...allKickoffs);
    const thisTeamKickoff = scheduleByTeam.get(nflTeam)?.kickoff_time;
    if (!thisTeamKickoff) return false;

    return new Date(thisTeamKickoff).getTime() === latestKickoff;
}
