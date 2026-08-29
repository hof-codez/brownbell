// set-duo/index.ts
// POST { teamId, deviceToken, awardType, playerIndex, sleeperPlayerId } ->
//   { success, error? }
//
// Every check here is authoritative - nothing from the client is trusted.
// The device token proves who's asking; the player must actually be on that
// team's live Sleeper roster; the slot's lock/swap situation (healthy-locked,
// temporary injury, or permanent trade/release) is classified from live
// Sleeper data via _shared/swapStatus.ts, and the team's manual-swap budget
// is enforced from the teams table - never from anything the client sends.
//
// Season of Boom (awardType 'boom') differs in three ways: it uses IDP
// positions (DL/LB/DB) with no combo constraint (any 2 freely) and no
// cross-award exclusivity (IDP positions never overlap with Main
// Award/Next Up's offense), and it enforces a NEW rule this function is
// otherwise the first to apply: a candidate whose own game kicks off
// within 1 minute is rejected outright, even if everything else about the
// pick would be valid - see _shared/nflSchedule.ts's kickoff-timing rule.
// This is the owner's actual deadline; auto-sub's own wider 15-minute
// safety margin lives in update-standings.js, not here.
//
// verify_jwt must be OFF for this function (see ../../config.toml).

import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { fetchAllPlayers, fetchRosterPlayerIds } from '../_shared/sleeper.ts';
import { hasTeamGameStarted, getMinutesUntilKickoff } from '../_shared/nflSchedule.ts';
import { isValidMainCombo, isValidNextUpCombo, isNextUpEligibleExperience, MAIN_POSITIONS, NEXTUP_POSITIONS, BOOM_POSITIONS } from '../_shared/eligibility.ts';
import { classifySwapSituation, checkSwapPermission } from '../_shared/swapStatus.ts';

Deno.serve(async (req: Request) => {
    const preflight = handleCorsPreflightRequest(req);
    if (preflight) return preflight;

    try {
        const { teamId, deviceToken, awardType, playerIndex, sleeperPlayerId } = await req.json();

        if (!teamId || !deviceToken || !['main', 'nextup', 'boom'].includes(awardType) || ![0, 1].includes(playerIndex) || !sleeperPlayerId) {
            return jsonResponse({ success: false, error: 'Missing or invalid input' }, 400);
        }

        const supabase = createAdminClient();

        const { data: claim, error: claimError } = await supabase
            .from('team_claims').select('device_tokens').eq('team_id', teamId).maybeSingle();
        if (claimError || !claim) {
            return jsonResponse({ success: false, error: 'Team has not been claimed yet' }, 403);
        }
        const authorized = (claim.device_tokens || []).some((d: { token: string }) => d.token === deviceToken);
        if (!authorized) {
            return jsonResponse({ success: false, error: 'This device is not authorized for this team' }, 403);
        }

        const { data: team, error: teamError } = await supabase
            .from('teams').select('id, sleeper_roster_id, season_id, permanent_swaps_used, manual_privilege').eq('id', teamId).maybeSingle();
        if (teamError || !team) {
            return jsonResponse({ success: false, error: 'Team not found' }, 404);
        }

        const { data: season, error: seasonError } = await supabase
            .from('seasons').select('sleeper_league_id, current_week, year').eq('id', team.season_id).maybeSingle();
        if (seasonError || !season) {
            return jsonResponse({ success: false, error: 'Season not found' }, 404);
        }

        const { data: allDuos, error: duoError } = await supabase
            .from('duos').select('award_type, player_index, sleeper_player_id, player_name, player_position')
            .eq('team_id', teamId);
        if (duoError) {
            return jsonResponse({ success: false, error: 'Failed to load current duo' }, 500);
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
        let isPermanentSwap = false;
        if (currentPlayer?.sleeper_player_id) {
            const currentP = allPlayers[currentPlayer.sleeper_player_id];
            if (currentP?.team) {
                locked = await hasTeamGameStarted(currentP.team, 1, String(season.year));
            }

            if (locked) {
                const situation = classifySwapSituation(currentPlayer.sleeper_player_id, rosterPlayerIds, allPlayers);
                const permission = checkSwapPermission(situation, team.manual_privilege, team.permanent_swaps_used);
                if (!permission.allowed) {
                    return jsonResponse({ success: false, error: permission.reason || 'This change is not allowed right now' }, 409);
                }
                isPermanentSwap = situation === 'permanent';
            }
        }

        if (!rosterPlayerIds.includes(sleeperPlayerId)) {
            return jsonResponse({ success: false, error: 'That player is not on your current roster' }, 400);
        }

        if (otherAwardPlayerIds.has(sleeperPlayerId)) {
            return jsonResponse({ success: false, error: `That player is already used in your ${otherAwardType === 'main' ? 'Main Award' : 'Next Up'} duo` }, 400);
        }

        const newPlayer = allPlayers[sleeperPlayerId];
        if (!newPlayer?.position) {
            return jsonResponse({ success: false, error: 'Could not resolve that player' }, 400);
        }

        const validPositions = awardType === 'nextup' ? NEXTUP_POSITIONS : awardType === 'boom' ? BOOM_POSITIONS : MAIN_POSITIONS;
        if (!validPositions.has(newPlayer.position)) {
            const awardLabel = awardType === 'nextup' ? 'Next Up' : awardType === 'boom' ? 'Season of Boom' : 'the Main Award';
            return jsonResponse({ success: false, error: `${newPlayer.position} is not eligible for ${awardLabel}` }, 400);
        }

        if (awardType === 'nextup' && !isNextUpEligibleExperience(newPlayer.years_exp || 0)) {
            return jsonResponse({ success: false, error: `${newPlayer.first_name} ${newPlayer.last_name} has too many years of experience for Next Up` }, 400);
        }

        if (otherSlotPlayer?.sleeper_player_id === sleeperPlayerId) {
            return jsonResponse({ success: false, error: 'That player is already in the other slot' }, 400);
        }

        // Boom-only: the owner's actual deadline. A candidate whose own
        // game kicks off within 1 minute (or has already started) is
        // rejected outright - this is the rule that makes "manual control
        // can override auto-sub until 1 minute before kickoff" a real,
        // server-enforced guarantee rather than just a UI suggestion.
        if (awardType === 'boom' && newPlayer.team) {
            const minutesUntilKickoff = await getMinutesUntilKickoff(newPlayer.team, season.current_week, String(season.year));
            if (minutesUntilKickoff !== 'bye' && (minutesUntilKickoff === null || minutesUntilKickoff <= 1)) {
                return jsonResponse({
                    success: false,
                    error: minutesUntilKickoff === null
                        ? 'Could not confirm this player has not already started - try again in a moment'
                        : `${newPlayer.first_name} ${newPlayer.last_name}'s game has already started or is about to - too late to pick them this week`
                }, 400);
            }
        }

        if (otherSlotPlayer?.sleeper_player_id && awardType !== 'boom') {
            const otherP = allPlayers[otherSlotPlayer.sleeper_player_id];
            if (otherP?.position) {
                const otherInfo = { position: otherP.position, yearsExp: otherP.years_exp || 0 };
                const newInfo = { position: newPlayer.position, yearsExp: newPlayer.years_exp || 0 };
                const valid = awardType === 'main' ? isValidMainCombo(otherInfo, newInfo) : isValidNextUpCombo(otherInfo, newInfo);
                if (!valid) {
                    return jsonResponse({ success: false, error: 'That pairing does not satisfy the award rules' }, 400);
                }
            }
        }

        const { error: upsertError } = await supabase.from('duos').upsert({
            team_id: teamId,
            award_type: awardType,
            player_index: playerIndex,
            player_name: `${newPlayer.first_name || ''} ${newPlayer.last_name || ''}`.trim(),
            player_position: newPlayer.position,
            sleeper_player_id: sleeperPlayerId,
            source: 'owner'
        }, { onConflict: 'team_id,award_type,player_index' });

        if (upsertError) {
            return jsonResponse({ success: false, error: 'Failed to save' }, 500);
        }

        if (isPermanentSwap) {
            const { error: teamUpdateError } = await supabase
                .from('teams')
                .update({ permanent_swaps_used: team.permanent_swaps_used + 1 })
                .eq('id', teamId);
            if (teamUpdateError) {
                console.error('Failed to increment permanent_swaps_used:', teamUpdateError);
            }
        }

        const { error: closeOutError } = await supabase
            .from('substitutions')
            .update({ end_week: Math.max(0, season.current_week - 1), active: false })
            .eq('team_id', teamId)
            .eq('award_type', awardType)
            .eq('player_index', playerIndex)
            .is('end_week', null);
        if (closeOutError) {
            console.error('Failed to close out prior substitution entries:', closeOutError);
        }

        const reason = !locked
            ? (currentPlayer ? 'Owner changed pick before lock' : 'Owner set pick')
            : (isPermanentSwap ? 'Owner replacement - permanent (trade/release)' : 'Owner replacement - temporary (injury)');

        const { error: logError } = await supabase.from('substitutions').insert({
            team_id: teamId,
            award_type: awardType,
            player_index: playerIndex,
            original_name: currentPlayer?.player_name || '(not set)',
            original_position: currentPlayer?.player_position || '-',
            substitute_name: `${newPlayer.first_name || ''} ${newPlayer.last_name || ''}`.trim(),
            substitute_player_id: sleeperPlayerId,
            substitute_position: newPlayer.position,
            start_week: season.current_week,
            end_week: null,
            active: true,
            source: 'owner',
            reason
        });
        if (logError) {
            console.error('Failed to log substitution history:', logError);
        }

        return jsonResponse({ success: true });

    } catch (err) {
        console.error('set-duo error:', err);
        return jsonResponse({ success: false, error: 'Unexpected server error' }, 500);
    }
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
