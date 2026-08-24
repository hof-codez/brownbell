// set-duo/index.ts
// POST { teamId, deviceToken, awardType, playerIndex, sleeperPlayerId } ->
//   { success, error? }
//
// Every check here is authoritative - nothing from the client is trusted.
// The device token proves who's asking; the player must actually be on that
// team's live Sleeper roster; the slot must not be locked; the pairing must
// satisfy the award's rule. All of it re-verified here even though the
// picker UI already filtered to "eligible" candidates, since a client-side
// filter is a UX convenience, never a security boundary.
//
// verify_jwt must be OFF for this function (see ../../config.toml).

import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { fetchAllPlayers, fetchRosterPlayerIds } from '../_shared/sleeper.ts';
import { hasTeamGameStarted } from '../_shared/nflSchedule.ts';
import { isValidMainCombo, isValidNextUpCombo, isNextUpEligibleExperience, MAIN_POSITIONS, NEXTUP_POSITIONS } from '../_shared/eligibility.ts';

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
            .from('teams').select('id, sleeper_roster_id, season_id').eq('id', teamId).maybeSingle();
        if (teamError || !team) {
            return jsonResponse({ success: false, error: 'Team not found' }, 404);
        }

        const { data: season, error: seasonError } = await supabase
            .from('seasons').select('sleeper_league_id, current_week, year').eq('id', team.season_id).maybeSingle();
        if (seasonError || !season) {
            return jsonResponse({ success: false, error: 'Season not found' }, 404);
        }

        const { data: currentDuo, error: duoError } = await supabase
            .from('duos').select('player_index, sleeper_player_id')
            .eq('team_id', teamId).eq('award_type', awardType);
        if (duoError) {
            return jsonResponse({ success: false, error: 'Failed to load current duo' }, 500);
        }

        const currentPlayer = currentDuo?.find(d => d.player_index === playerIndex) || null;
        const otherSlotPlayer = currentDuo?.find(d => d.player_index !== playerIndex) || null;

        const [allPlayers, rosterPlayerIds] = await Promise.all([
            fetchAllPlayers(),
            fetchRosterPlayerIds(season.sleeper_league_id, team.sleeper_roster_id)
        ]);

        // Lock check - can't change a slot whose current player's game already started
        if (currentPlayer?.sleeper_player_id) {
            const currentP = allPlayers[currentPlayer.sleeper_player_id];
            if (currentP?.team) {
                const locked = await hasTeamGameStarted(currentP.team, season.current_week, String(season.year));
                if (locked) {
                    return jsonResponse({ success: false, error: 'This slot is locked - that game has already started this week' }, 409);
                }
            }
        }

        // The requested player must actually be on this team's live roster
        if (!rosterPlayerIds.includes(sleeperPlayerId)) {
            return jsonResponse({ success: false, error: 'That player is not on your current roster' }, 400);
        }

        const newPlayer = allPlayers[sleeperPlayerId];
        if (!newPlayer?.position) {
            return jsonResponse({ success: false, error: 'Could not resolve that player' }, 400);
        }

        const validPositions = awardType === 'nextup' ? NEXTUP_POSITIONS : MAIN_POSITIONS;
        if (!validPositions.has(newPlayer.position)) {
            return jsonResponse({ success: false, error: `${newPlayer.position} is not eligible for ${awardType === 'nextup' ? 'Next Up' : 'the Main Award'}` }, 400);
        }

        // Individual Next Up eligibility (0-3 yrs) applies regardless of whether the
        // other slot is filled - this must be checked even with no pairing partner yet.
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
            sleeper_player_id: sleeperPlayerId
        }, { onConflict: 'team_id,award_type,player_index' });

        if (upsertError) {
            return jsonResponse({ success: false, error: 'Failed to save' }, 500);
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
