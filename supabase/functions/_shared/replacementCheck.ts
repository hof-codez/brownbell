// _shared/replacementCheck.ts
// Mirrors update-standings.js's selectAutoReplacement candidate-scanning
// logic (position validity, exclusion of already-used players, injury/bye
// status, the kickoff-timing "already started" check, the no-sandbagging
// "candidate's game can't kick off earlier than the player being
// replaced's own game" rule, and combo/pairing validation) as a plain
// boolean - does at least one eligible replacement currently exist on
// this roster for this slot - rather than selecting and returning one.
//
// Used by set-standby to gate when a standby can actually be set: only
// once the normal substitution system genuinely has nobody who could
// cover this slot right now, not merely "this happens to be the week's
// last game" (too narrow - a real reported case had a Sunday Night
// player with zero eligible replacements on the roster, even though
// Monday Night still followed that same week).

import type { SleeperPlayer } from './sleeper.ts';
import type { WeekScheduleMap } from './nflSchedule.ts';
import { getMinutesUntilKickoffFromSchedule } from './nflSchedule.ts';
import { isValidMainCombo, isValidNextUpCombo, isNextUpEligibleExperience, MAIN_POSITIONS, NEXTUP_POSITIONS, BOOM_POSITIONS, type PlayerInfo } from './eligibility.ts';

export interface HasEligibleReplacementArgs {
    rosterPlayerIds: string[];
    allPlayers: Record<string, SleeperPlayer>;
    excludeSleeperIds: Set<string>;
    awardType: 'main' | 'nextup' | 'boom';
    otherSlotInfo: PlayerInfo | null;
    weekSchedule: WeekScheduleMap;
    currentPlayerTeam: string | null;
}

export function hasEligibleReplacement(args: HasEligibleReplacementArgs): boolean {
    const { rosterPlayerIds, allPlayers, excludeSleeperIds, awardType, otherSlotInfo, weekSchedule, currentPlayerTeam } = args;

    const validPositions = awardType === 'nextup' ? NEXTUP_POSITIONS : awardType === 'boom' ? BOOM_POSITIONS : MAIN_POSITIONS;

    // Same no-earlier-game rule selectAutoReplacement enforces in
    // update-standings.js - a candidate whose own game already kicked off
    // strictly before the player being replaced's game can never be a
    // real auto-sub candidate, since picking them would already be
    // second-guessing a known result.
    const currentKickoff = currentPlayerTeam ? weekSchedule?.get(currentPlayerTeam)?.getTime() ?? null : null;

    for (const id of rosterPlayerIds) {
        if (excludeSleeperIds.has(id)) continue;

        const p = allPlayers[id];
        if (!p?.position || !validPositions.has(p.position)) continue;

        if (p.injury_status) {
            const status = p.injury_status.toLowerCase();
            if (['out', 'doubtful', 'ir', 'pup'].includes(status)) continue;
        }

        const minutesUntilKickoff = getMinutesUntilKickoffFromSchedule(weekSchedule, p.team || '');
        if (minutesUntilKickoff === null) continue; // unresolvable schedule data - conservatively not usable
        if (minutesUntilKickoff === 'bye') continue; // can't score anything if activated
        if (minutesUntilKickoff <= 0) continue; // already started

        if (currentKickoff !== null && p.team) {
            const candidateKickoff = weekSchedule?.get(p.team)?.getTime() ?? null;
            if (candidateKickoff !== null && candidateKickoff < currentKickoff) continue;
        }

        if (awardType === 'nextup' && !isNextUpEligibleExperience(p.years_exp || 0)) continue;

        if (otherSlotInfo && awardType !== 'boom') {
            const candidateInfo: PlayerInfo = { position: p.position, yearsExp: p.years_exp || 0 };
            const valid = awardType === 'main'
                ? isValidMainCombo(otherSlotInfo, candidateInfo)
                : isValidNextUpCombo(otherSlotInfo, candidateInfo);
            if (!valid) continue;
        }

        return true;
    }

    return false;
}
