// get-eligible-roster/index.ts
// POST { teamId, awardType, playerIndex } ->
//   { locked, situation, permissionReason, currentPlayer, otherSlotPlayer, candidates: [...] }
//
// Read-only. Shows an owner what they could pick for one slot, computed the
// exact same way set-duo validates a real pick - so nothing shown here as
// "eligible" could ever be rejected when they actually submit it. This
// includes the full lock/injury/permanent-swap state, not just a plain
// locked/unlocked flag - see _shared/swapStatus.ts for the actual rule - and
// cross-award exclusivity: a player currently used in this team's OTHER
// award can never appear as a candidate here.
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
        const { teamId, awardType, playerIndex } = await req.json();

        if (!teamId || !['main', 'nextup'].includes(awardType) || ![0, 1].includes(playerIndex)) {
            return jsonResponse({ error: 'Missing or invalid teamId/awardType/playerIndex' }, 400);
        }

        const supabase = createAdminClient();

        const { data: team, error: teamError } = await supabase
            .from('teams').select('id, sleeper_roster_id, season_id, permanent_swaps_used, manual_privilege').eq('id', teamId).maybeSingle();
        if (teamError || !team) {
            return jsonResponse({ error: 'Team not found' }, 404);
        }

        const { data: season, error: seasonError } = await supabase
            .from('seasons').select('sleeper_league_id, current_week, year').eq('id', team.season_id).maybeSingle();
        if (seasonError || !season) {
            return jsonResponse({ error: 'Season not found' }, 404);
        }

        // Fetch BOTH awards' duos for this team in one go - the current award
        // (for the usual same-award checks) and the other award (purely to
        // exclude its 2 players from candidates - cross-award exclusivity).
        const { data: allDuos, error: duoError } = await supabase
            .from('duos').select('award_type, player_index, player_name, player_position, sleeper_player_id')
            .eq('team_id', teamId);
        if (duoError) {
            return jsonResponse({ error: 'Failed to load current duo' }, 500);
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

        // Lock check: has the current occupant's own Week 1 game already happened?
        // If not, nothing below applies yet - the slot is freely editable, same as
        // pre-season. Locks are for the SEASON (week 1 specifically), not the week.
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
            const permission = checkSwapPermission(situation, team.manual_privilege, team.permanent_swaps_used);
            allowSwap = permission.allowed;
            permissionReason = permission.reason;
        }

        const validPositions = awardType === 'nextup' ? NEXTUP_POSITIONS : MAIN_POSITIONS;
        const otherPlayerInfo = otherSlotPlayer?.sleeper_player_id
            ? { position: allPlayers[otherSlotPlayer.sleeper_player_id]?.position || otherSlotPlayer.player_position, yearsExp: allPlayers[otherSlotPlayer.sleeper_player_id]?.years_exp || 0 }
            : null;

        const candidates = !allowSwap ? [] : rosterPlayerIds
            .filter(id => id !== otherSlotPlayer?.sleeper_player_id) // can't pick the same player twice within this award
            .filter(id => id !== currentPlayer?.sleeper_player_id) // re-picking the current player isn't a "swap"
            .filter(id => !otherAwardPlayerIds.has(id)) // cross-award exclusivity - already used in the other award
            .map(id => ({ id, player: allPlayers[id] }))
            .filter(({ player }) => player?.position && validPositions.has(player.position))
            .filter(({ player }) => {
                // Individual eligibility applies regardless of whether the other slot
                // is filled - a 4th-season-or-later player is never Next Up eligible,
                // empty other slot or not. This must run even with no pairing partner yet.
                if (awardType === 'nextup' && !isNextUpEligibleExperience(player!.years_exp || 0)) return false;
                return true;
            })
            .filter(({ player }) => {
                if (!otherPlayerInfo) return true; // other slot empty - no pairing constraint to check yet
                const candidateInfo = { position: player!.position!, yearsExp: player!.years_exp || 0 };
                return awardType === 'main'
                    ? isValidMainCombo(otherPlayerInfo, candidateInfo)
                    : isValidNextUpCombo(otherPlayerInfo, candidateInfo);
            })
            .map(({ id, player }) => ({
                sleeperPlayerId: id,
                name: `${player!.first_name || ''} ${player!.last_name || ''}`.trim(),
                position: player!.position,
                yearsExp: player!.years_exp || 0
            }));

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
