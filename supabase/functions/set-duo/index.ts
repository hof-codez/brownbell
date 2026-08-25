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
// verify_jwt must be OFF for this function (see ../../config.toml).

import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { fetchAllPlayers, fetchRosterPlayerIds } from '../_shared/sleeper.ts';
import { hasTeamGameStarted } from '../_shared/nflSchedule.ts';
import { isValidMainCombo, isValidNextUpCombo, isNextUpEligibleExperience, MAIN_POSITIONS, NEXTUP_POSITIONS } from '../_shared/eligibility.ts';
import { classifySwapSituation, checkSwapPermission } from '../_shared/swapStatus.ts';

Deno.serve(async (req: Request) => {
    const preflight = handleCorsPreflightRequest(req);
    if (preflight) return preflight;

    try {
        const { teamId, deviceToken, awardType, playerIndex, sleeperPlayerId } = await req.json();

        if (!teamId || !deviceToken || !['main', 'nextup'].includes(awardType) || ![0, 1].includes(playerIndex) || !sleeperPlayerId) {
            return jsonResponse({ success: false, error: 'Missing or invalid input' }, 400);
        }

        const supabase = createAdminClient();

        // Auth: this device must be authorized for this team
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

        // Fetch BOTH awards' duos for this team in one go - the current award
        // (for the usual same-award checks) and the other award (to enforce
        // cross-award exclusivity: a player used in one award can't also be
        // used in the other for the same team).
        const { data: allDuos, error: duoError } = await supabase
            .from('duos').select('award_type, player_index, sleeper_player_id, player_name, player_position')
            .eq('team_id', teamId);
        if (duoError) {
            return jsonResponse({ success: false, error: 'Failed to load current duo' }, 500);
        }

        const currentDuo = (allDuos ?? []).filter(d => d.award_type === awardType);
        const otherAwardType = awardType === 'main' ? 'nextup' : 'main';
        const otherAwardPlayerIds = new Set(
            (allDuos ?? [])
                .filter(d => d.award_type === otherAwardType && d.sleeper_player_id)
                .map(d => d.sleeper_player_id as string)
        );

        const currentPlayer = currentDuo.find(d => d.player_index === playerIndex) || null;
        const otherSlotPlayer = currentDuo.find(d => d.player_index !== playerIndex) || null;

        const [allPlayers, rosterPlayerIds] = await Promise.all([
            fetchAllPlayers(),
            fetchRosterPlayerIds(season.sleeper_league_id, team.sleeper_roster_id)
        ]);

        // Lock + swap-permission check. Locks are for the SEASON (week 1
        // specifically), not the week - see get-eligible-roster's matching comment.
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

        // The requested player must actually be on this team's live roster
        if (!rosterPlayerIds.includes(sleeperPlayerId)) {
            return jsonResponse({ success: false, error: 'That player is not on your current roster' }, 400);
        }

        // Cross-award exclusivity - a player already used in this team's other
        // award can never be double-booked into this one too.
        if (otherAwardPlayerIds.has(sleeperPlayerId)) {
            return jsonResponse({ success: false, error: `That player is already used in your ${otherAwardType === 'main' ? 'Main Award' : 'Next Up'} duo` }, 400);
        }

        const newPlayer = allPlayers[sleeperPlayerId];
        if (!newPlayer?.position) {
            return jsonResponse({ success: false, error: 'Could not resolve that player' }, 400);
        }

        const validPositions = awardType === 'nextup' ? NEXTUP_POSITIONS : MAIN_POSITIONS;
        if (!validPositions.has(newPlayer.position)) {
            return jsonResponse({ success: false, error: `${newPlayer.position} is not eligible for ${awardType === 'nextup' ? 'Next Up' : 'the Main Award'}` }, 400);
        }

        // Individual Next Up eligibility (entering season 1-3) applies regardless of
        // whether the other slot is filled - this must be checked even with no
        // pairing partner yet.
        if (awardType === 'nextup' && !isNextUpEligibleExperience(newPlayer.years_exp || 0)) {
            return jsonResponse({ success: false, error: `${newPlayer.first_name} ${newPlayer.last_name} has too many years of experience for Next Up` }, 400);
        }

        if (otherSlotPlayer?.sleeper_player_id === sleeperPlayerId) {
            return jsonResponse({ success: false, error: 'That player is already in the other slot' }, 400);
        }

        if (otherSlotPlayer?.sleeper_player_id) {
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

        // Only a genuinely permanent (trade/release) swap consumes the season's
        // 2-swap budget - temporary injury swaps never touch this counter.
        if (isPermanentSwap) {
            const { error: teamUpdateError } = await supabase
                .from('teams')
                .update({ permanent_swaps_used: team.permanent_swaps_used + 1 })
                .eq('id', teamId);
            if (teamUpdateError) {
                // The duo write already succeeded - log this but don't fail the
                // whole request over a bookkeeping update.
                console.error('Failed to increment permanent_swaps_used:', teamUpdateError);
            }
        }

        // Log this change to substitutions as a pure history entry - previously
        // only the automation's own changes were logged here, meaning owner-
        // driven swaps were invisible to any activity/history view.
        //
        // IMPORTANT: updateAllScores still resolves "who's currently in this
        // slot" by searching this table for an entry with end_week IS NULL -
        // that's legacy, pre-dating duos becoming the real source of truth,
        // and hasn't been migrated off yet. Until it is, every write here
        // MUST close out any prior open entry for this exact slot first, or
        // the scoring logic can find more than one "active" candidate and
        // pick whichever it happens to see first - which is not guaranteed
        // to be the most recent pick. This close-out is what keeps that
        // legacy lookup correct in the meantime.
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
            // The duo write already succeeded - log this but don't fail the
            // whole request over a history-log entry.
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
