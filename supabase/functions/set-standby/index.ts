// set-standby/index.ts
// POST { teamId, deviceToken, awardType, playerIndex, standbySleeperPlayerId } ->
//   { success, error? }
//
// Solves a real, structural gap in the existing auto-sub logic: a
// replacement's own game must kick off at the same time or later than
// the player being replaced (a no-sandbagging rule, see
// update-standings.js's selectAutoReplacement) - but when the duo
// member's own game IS the week's last one, nothing else that week
// kicks off later, so there is structurally no eligible auto-sub
// candidate at all if that player gets ruled out.
//
// This lets an owner pre-commit a "standby" for exactly that situation -
// but only while it's still genuinely blind: BOTH the current player's
// own game and the proposed standby's own game must not have started
// yet. Once either has, the choice can no longer be set or changed for
// that week, for the same no-sandbagging reason the normal rule exists.
//
// Deliberately named "standby" everywhere (never "auto-sub" or
// "substitute" alone) to stay clearly distinct from the existing,
// unrelated auto-sub feature this covers a gap in. See
// 033-standby-substitutes.sql for the storage and
// update-standings.js's processDuoSlots for where this actually
// activates a saved standby.
//
// verify_jwt must be OFF for this function (see ../../config.toml).

import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { fetchAllPlayers, fetchRosterPlayerIds } from '../_shared/sleeper.ts';
import { fetchWeekSchedule, getMinutesUntilKickoffFromSchedule } from '../_shared/nflSchedule.ts';
import { isValidMainCombo, isValidNextUpCombo, isNextUpEligibleExperience, MAIN_POSITIONS, NEXTUP_POSITIONS, BOOM_POSITIONS } from '../_shared/eligibility.ts';

Deno.serve(async (req: Request) => {
    const preflight = handleCorsPreflightRequest(req);
    if (preflight) return preflight;

    try {
        const { teamId, deviceToken, awardType, playerIndex, standbySleeperPlayerId } = await req.json();

        if (!teamId || !deviceToken || !['main', 'nextup', 'boom'].includes(awardType) || ![0, 1].includes(playerIndex) || !standbySleeperPlayerId) {
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
            .from('teams').select('id, sleeper_roster_id, season_id').eq('id', teamId).maybeSingle();
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
        const currentPlayer = currentDuo.find(d => d.player_index === playerIndex) || null;
        const otherSlotPlayer = currentDuo.find(d => d.player_index !== playerIndex) || null;

        if (!currentPlayer?.sleeper_player_id) {
            return jsonResponse({ success: false, error: 'This slot has no current player to set a standby for' }, 400);
        }

        const otherAwardType = awardType === 'main' ? 'nextup' : 'main';
        const otherAwardPlayerIds = new Set(
            awardType === 'boom' ? [] : (allDuos ?? [])
                .filter(d => d.award_type === otherAwardType && d.sleeper_player_id)
                .map(d => d.sleeper_player_id as string)
        );

        const [allPlayers, rosterPlayerIds, weekSchedule] = await Promise.all([
            fetchAllPlayers(),
            fetchRosterPlayerIds(season.sleeper_league_id, team.sleeper_roster_id),
            fetchWeekSchedule(season.current_week, String(season.year))
        ]);

        if (!weekSchedule) {
            return jsonResponse({ success: false, error: 'Could not confirm this week\'s schedule - try again in a moment' }, 500);
        }

        const currentP = allPlayers[currentPlayer.sleeper_player_id];
        if (!currentP?.team) {
            return jsonResponse({ success: false, error: 'Could not resolve the current player\'s NFL team' }, 400);
        }

        // The actual condition this feature exists for: not literally
        // "is this a Monday" (which gets genuinely messy across a kickoff
        // that crosses midnight UTC), but "does nothing else this week
        // kick off later than this player's own game" - the exact
        // structural reason the normal auto-sub rule can find no one.
        // Comparing raw kickoff Date objects directly sidesteps any
        // timezone conversion entirely.
        const allKickoffs = [...weekSchedule.values()].map(d => d.getTime());
        const latestKickoff = allKickoffs.length > 0 ? Math.max(...allKickoffs) : null;
        const currentKickoff = weekSchedule.get(currentP.team)?.getTime() ?? null;
        const isLastGameOfWeek = latestKickoff !== null && currentKickoff === latestKickoff;

        if (!isLastGameOfWeek) {
            return jsonResponse({ success: false, error: 'A standby can only be set for a player whose game is the last one of the week - every other week, the normal substitution system already covers this.' }, 400);
        }

        const currentMinutesUntilKickoff = getMinutesUntilKickoffFromSchedule(weekSchedule, currentP.team);
        if (currentMinutesUntilKickoff === null || currentMinutesUntilKickoff === 'bye' || currentMinutesUntilKickoff <= 0) {
            return jsonResponse({ success: false, error: 'Too late to set a standby - this player\'s game has already started' }, 400);
        }

        if (standbySleeperPlayerId === currentPlayer.sleeper_player_id) {
            return jsonResponse({ success: false, error: 'The standby must be a different player than the one they would replace' }, 400);
        }

        if (!rosterPlayerIds.includes(standbySleeperPlayerId)) {
            return jsonResponse({ success: false, error: 'That player is not on your current roster' }, 400);
        }

        if (otherAwardPlayerIds.has(standbySleeperPlayerId)) {
            return jsonResponse({ success: false, error: `That player is already used in your ${otherAwardType === 'main' ? 'Main Award' : 'Next Up'} duo` }, 400);
        }

        if (otherSlotPlayer?.sleeper_player_id === standbySleeperPlayerId) {
            return jsonResponse({ success: false, error: 'That player is already in your other slot' }, 400);
        }

        const standbyPlayer = allPlayers[standbySleeperPlayerId];
        if (!standbyPlayer?.position) {
            return jsonResponse({ success: false, error: 'Could not resolve that player' }, 400);
        }

        const validPositions = awardType === 'nextup' ? NEXTUP_POSITIONS : awardType === 'boom' ? BOOM_POSITIONS : MAIN_POSITIONS;
        if (!validPositions.has(standbyPlayer.position)) {
            const awardLabel = awardType === 'nextup' ? 'Next Up' : awardType === 'boom' ? 'Season of Boom' : 'the Main Award';
            return jsonResponse({ success: false, error: `${standbyPlayer.position} is not eligible for ${awardLabel}` }, 400);
        }

        if (awardType === 'nextup' && !isNextUpEligibleExperience(standbyPlayer.years_exp || 0)) {
            return jsonResponse({ success: false, error: `${standbyPlayer.first_name} ${standbyPlayer.last_name} has too many years of experience for Next Up` }, 400);
        }

        // Same no-sandbagging principle in the other direction: the
        // standby's OWN game must not have started yet either, or this
        // pick would no longer be genuinely blind.
        if (standbyPlayer.team) {
            const standbyMinutesUntilKickoff = getMinutesUntilKickoffFromSchedule(weekSchedule, standbyPlayer.team);
            if (standbyMinutesUntilKickoff === null) {
                return jsonResponse({ success: false, error: 'Could not confirm that player has not already started - try again in a moment' }, 400);
            }
            if (standbyMinutesUntilKickoff !== 'bye' && standbyMinutesUntilKickoff <= 0) {
                return jsonResponse({ success: false, error: `${standbyPlayer.first_name} ${standbyPlayer.last_name}'s game has already started - too late to name them as a standby this week` }, 400);
            }
            if (standbyMinutesUntilKickoff === 'bye') {
                return jsonResponse({ success: false, error: `${standbyPlayer.first_name} ${standbyPlayer.last_name} is on a bye this week and can't score any points if activated` }, 400);
            }
        }

        if (otherSlotPlayer?.sleeper_player_id && awardType !== 'boom') {
            const otherP = allPlayers[otherSlotPlayer.sleeper_player_id];
            if (otherP?.position) {
                const otherInfo = { position: otherP.position, yearsExp: otherP.years_exp || 0 };
                const standbyInfo = { position: standbyPlayer.position, yearsExp: standbyPlayer.years_exp || 0 };
                const valid = awardType === 'main' ? isValidMainCombo(otherInfo, standbyInfo) : isValidNextUpCombo(otherInfo, standbyInfo);
                if (!valid) {
                    return jsonResponse({ success: false, error: 'That pairing would not satisfy the award rules if activated' }, 400);
                }
            }
        }

        const { error: upsertError } = await supabase.from('standby_substitutes').upsert({
            team_id: teamId,
            award_type: awardType,
            player_index: playerIndex,
            week: season.current_week,
            standby_sleeper_player_id: standbySleeperPlayerId,
            standby_player_name: `${standbyPlayer.first_name || ''} ${standbyPlayer.last_name || ''}`.trim(),
            standby_player_position: standbyPlayer.position,
            covers_sleeper_player_id: currentPlayer.sleeper_player_id,
            consumed: false
        }, { onConflict: 'team_id,award_type,player_index,week' });

        if (upsertError) {
            console.error('standby_substitutes upsert failed:', upsertError);
            return jsonResponse({ success: false, error: `Failed to save: ${upsertError.message}` }, 500);
        }

        return jsonResponse({ success: true });

    } catch (err) {
        console.error('set-standby error:', err);
        return jsonResponse({ success: false, error: 'Unexpected server error' }, 500);
    }
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
