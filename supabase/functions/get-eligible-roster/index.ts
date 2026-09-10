// get-eligible-roster/index.ts
// POST { teamId, awardType, playerIndex } ->
//   { locked, situation, permissionReason, currentPlayer, otherSlotPlayer, candidates: [...] }
//
// Read-only. Shows an owner their ENTIRE roster for this slot - not just the
// eligible players. Every candidate carries an `ineligibleReason` (null if
// fully eligible), computed the exact same way set-duo validates a real
// pick, so nothing shown here as eligible could ever be rejected on submit,
// and nothing flagged as ineligible could ever slip through. This includes
// the full lock/injury/permanent-swap state, not just a plain locked/
// unlocked flag - see _shared/swapStatus.ts for the actual rule - and
// cross-award exclusivity: a player currently used in this team's OTHER
// award is shown but flagged, never a real option here.
//
// Season of Boom (awardType 'boom') is exempt from cross-award exclusivity
// entirely - it uses IDP positions (DL/LB/DB), which never overlap with
// Main Award or Next Up's offensive positions, so there's nothing to flag
// there. It also has no combo constraint (any 2 IDPs freely), but does add
// one thing Main Award/Next Up don't have: a candidate whose own game kicks
// off within 1 minute is flagged the same as one already started, since
// picking them would be immediately rejected by set-duo anyway (see
// _shared/nflSchedule.ts's kickoff-timing rule).
//
// verify_jwt must be OFF for this function (see ../../config.toml).

import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { fetchAllPlayers, fetchRosterPlayerIds } from '../_shared/sleeper.ts';
import { hasTeamGameStarted, fetchWeekSchedule, isEligibleForSubFromSchedule, getMinutesUntilKickoffFromSchedule } from '../_shared/nflSchedule.ts';
import { isValidMainCombo, isValidNextUpCombo, isNextUpEligibleExperience, MAIN_POSITIONS, NEXTUP_POSITIONS, BOOM_POSITIONS } from '../_shared/eligibility.ts';
import { classifySwapSituation, checkSwapPermission } from '../_shared/swapStatus.ts';

Deno.serve(async (req: Request) => {
    const preflight = handleCorsPreflightRequest(req);
    if (preflight) return preflight;

    try {
        const { teamId, awardType, playerIndex } = await req.json();

        if (!teamId || !['main', 'nextup', 'boom'].includes(awardType) || ![0, 1].includes(playerIndex)) {
            return jsonResponse({ error: 'Missing or invalid teamId/awardType/playerIndex' }, 400);
        }

        const supabase = createAdminClient();

        const { data: team, error: teamError } = await supabase
            .from('teams').select('id, sleeper_roster_id, season_id, main_permanent_swap_used, nextup_permanent_swap_used, boom_permanent_swap_used').eq('id', teamId).maybeSingle();
        if (teamError || !team) {
            return jsonResponse({ error: 'Team not found' }, 404);
        }

        const { data: season, error: seasonError } = await supabase
            .from('seasons').select('sleeper_league_id, current_week, year').eq('id', team.season_id).maybeSingle();
        if (seasonError || !season) {
            return jsonResponse({ error: 'Season not found' }, 404);
        }

        const { data: allDuos, error: duoError } = await supabase
            .from('duos').select('award_type, player_index, player_name, player_position, sleeper_player_id')
            .eq('team_id', teamId);
        if (duoError) {
            return jsonResponse({ error: 'Failed to load current duo' }, 500);
        }

        const currentDuo = (allDuos ?? []).filter(d => d.award_type === awardType);
        const otherAwardType = awardType === 'main' ? 'nextup' : 'main';
        const otherAwardPlayerIds = new Set(
            awardType === 'boom' ? [] : (allDuos ?? [])
                .filter(d => d.award_type === otherAwardType && d.sleeper_player_id)
                .map(d => d.sleeper_player_id as string)
        );

        const currentPlayer = currentDuo.find(d => d.player_index === playerIndex) || null;
        const otherSlotPlayer = currentDuo.find(d => d.player_index !== playerIndex) || null;

        const [allPlayers, rosterPlayerIds] = await Promise.all([
            fetchAllPlayers(),
            fetchRosterPlayerIds(season.sleeper_league_id, team.sleeper_roster_id)
        ]);

        let locked = false;
        if (currentPlayer?.sleeper_player_id) {
            const p = allPlayers[currentPlayer.sleeper_player_id];
            if (p?.team) {
                locked = await hasTeamGameStarted(p.team, 1, String(season.year));
            }
        }

        let situation: 'healthy-locked' | 'temporary' | 'permanent' | null = null;
        let permissionReason: string | undefined;
        let allowSwap = true;

        if (locked) {
            situation = classifySwapSituation(currentPlayer?.sleeper_player_id ?? null, rosterPlayerIds, allPlayers);
            const permanentSwapUsed = awardType === 'nextup' ? team.nextup_permanent_swap_used
                : awardType === 'boom' ? team.boom_permanent_swap_used
                : team.main_permanent_swap_used;
            const permission = checkSwapPermission(situation, permanentSwapUsed);
            allowSwap = permission.allowed;
            permissionReason = permission.reason;
        }

        const validPositions = awardType === 'nextup' ? NEXTUP_POSITIONS : awardType === 'boom' ? BOOM_POSITIONS : MAIN_POSITIONS;
        const otherPlayerInfo = otherSlotPlayer?.sleeper_player_id
            ? { position: allPlayers[otherSlotPlayer.sleeper_player_id]?.position || otherSlotPlayer.player_position, yearsExp: allPlayers[otherSlotPlayer.sleeper_player_id]?.years_exp || 0 }
            : null;

        const awardLabel = awardType === 'nextup' ? 'Next Up' : awardType === 'boom' ? 'Season of Boom' : 'Brown Bell';
        const otherAwardLabel = otherAwardType === 'main' ? 'Main Award' : 'Next Up';

        // Confirmed as a real gap via a live report: this was previously
        // gated on `locked` (the CURRENT occupant's own lock status), but a
        // candidate's own game status is a completely separate question -
        // a pre-lock slot (the current occupant's game hasn't started) can
        // still involve picking a DIFFERENT player whose own game already
        // happened earlier in the week, since NFL games spread across
        // Wed/Thu/Sun/Mon within the same week. Fetched whenever a swap is
        // allowed at all, not only once the slot is locked.
        const weekSchedule = allowSwap
            ? await fetchWeekSchedule(season.current_week, String(season.year))
            : null;

        // Every roster player is returned - not filtered down to only the
        // eligible ones. Each gets exactly one ineligibleReason (or null if
        // fully eligible), so the picker can show every name and cross out
        // the ones that aren't real options with a specific explanation,
        // rather than making them silently disappear. This generalizes the
        // "game started" show-and-flag pattern (confirmed via a real
        // report) to every ineligibility rule below, and makes Boom
        // consistent with Main/Next Up - Boom candidates whose game has
        // started are now flagged the same way rather than excluded
        // outright, since there's no reason this one rule alone should
        // behave differently from all the others.
        //
        // Checks run in order and the FIRST one that applies wins - a
        // player could technically fail more than one rule at once, but
        // showing one clear reason is more useful than stacking several.
        const candidates = !allowSwap ? [] : rosterPlayerIds
            .filter(id => id !== currentPlayer?.sleeper_player_id) // this slot's own current occupant - already shown separately as "Currently: X", not a candidate
            .map(id => ({ id, player: allPlayers[id] }))
            .filter(({ player }) => !!player?.position) // still skip entries with genuinely no resolvable player data
            .map(({ id, player }) => {
                const p = player!;
                let ineligibleReason: string | null = null;

                if (id === otherSlotPlayer?.sleeper_player_id) {
                    ineligibleReason = 'Already in your other slot';
                } else if (otherAwardPlayerIds.has(id)) {
                    ineligibleReason = `Already used in your ${otherAwardLabel} duo`;
                } else if (!validPositions.has(p.position!)) {
                    ineligibleReason = `${p.position} isn't eligible for ${awardLabel}`;
                } else if (awardType === 'nextup' && !isNextUpEligibleExperience(p.years_exp || 0)) {
                    ineligibleReason = 'Too many years of experience for Next Up';
                } else if (weekSchedule) {
                    // Boom keeps its own 1-minute safety buffer (a
                    // candidate whose game is about to start is treated
                    // the same as one already in progress); Main/Next Up
                    // use a plain "has it actually started" check.
                    const hasStarted = awardType === 'boom'
                        ? !isEligibleForSubFromSchedule(weekSchedule, p.team || '', 1)
                        : (() => {
                            const minutesUntilKickoff = getMinutesUntilKickoffFromSchedule(weekSchedule, p.team || '');
                            return minutesUntilKickoff !== null && minutesUntilKickoff !== 'bye' && minutesUntilKickoff <= 0;
                        })();
                    if (hasStarted) {
                        ineligibleReason = awardType === 'boom' ? 'Game started or about to start' : 'Game started';
                    }
                }

                // Combo/pairing rules checked last, and only once nothing
                // simpler already disqualified this candidate - Boom has
                // no combo constraint at all, so this never applies to it.
                if (!ineligibleReason && otherPlayerInfo && awardType !== 'boom') {
                    const candidateInfo = { position: p.position!, yearsExp: p.years_exp || 0 };
                    const valid = awardType === 'main'
                        ? isValidMainCombo(otherPlayerInfo, candidateInfo)
                        : isValidNextUpCombo(otherPlayerInfo, candidateInfo);
                    if (!valid) {
                        if (awardType === 'main') {
                            ineligibleReason = `Same position as your other ${awardLabel} player`;
                        } else if (otherPlayerInfo.position === candidateInfo.position) {
                            ineligibleReason = `Same position as your other ${awardLabel} player`;
                        } else if (otherPlayerInfo.yearsExp === candidateInfo.yearsExp) {
                            ineligibleReason = `Same experience year as your other ${awardLabel} player`;
                        } else {
                            ineligibleReason = `Doesn't pair validly with your other ${awardLabel} player`;
                        }
                    }
                }

                return {
                    sleeperPlayerId: id,
                    name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
                    position: p.position,
                    yearsExp: p.years_exp || 0,
                    // So the picker can show each candidate's next game info
                    // without a separate lookup - see 024-duo-player-team.sql.
                    team: p.team || null,
                    ineligibleReason
                };
            });

        return jsonResponse({
            locked,
            situation,
            permissionReason,
            currentPlayer: currentPlayer ? { name: currentPlayer.player_name, position: currentPlayer.player_position } : null,
            otherSlotPlayer: otherSlotPlayer ? { name: otherSlotPlayer.player_name, position: otherSlotPlayer.player_position } : null,
            candidates
        });

    } catch (err) {
        console.error('get-eligible-roster error:', err);
        return jsonResponse({ error: 'Unexpected server error' }, 500);
    }
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
