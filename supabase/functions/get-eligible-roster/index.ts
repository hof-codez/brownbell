// get-eligible-roster/index.ts
// POST { teamId, awardType, playerIndex } ->
//   { locked, lockedReason?, currentPlayer, otherSlotPlayer, candidates: [...] }
//
// Read-only. Shows an owner what they could pick for one slot, computed the
// exact same way set-duo validates a real pick - so nothing shown here as
// "eligible" could ever be rejected when they actually submit it.
//
// verify_jwt must be OFF for this function (see ../../config.toml).

import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { fetchAllPlayers, fetchRosterPlayerIds } from '../_shared/sleeper.ts';
import { hasTeamGameStarted } from '../_shared/nflSchedule.ts';
import { isValidMainCombo, isValidNextUpCombo, MAIN_POSITIONS, NEXTUP_POSITIONS } from '../_shared/eligibility.ts';

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
            .from('teams').select('id, sleeper_roster_id, season_id').eq('id', teamId).maybeSingle();
        if (teamError || !team) {
            return jsonResponse({ error: 'Team not found' }, 404);
        }

        const { data: season, error: seasonError } = await supabase
            .from('seasons').select('sleeper_league_id, current_week, year').eq('id', team.season_id).maybeSingle();
        if (seasonError || !season) {
            return jsonResponse({ error: 'Season not found' }, 404);
        }

        const { data: currentDuo, error: duoError } = await supabase
            .from('duos').select('player_index, player_name, player_position, sleeper_player_id')
            .eq('team_id', teamId).eq('award_type', awardType);
        if (duoError) {
            return jsonResponse({ error: 'Failed to load current duo' }, 500);
        }

        const currentPlayer = currentDuo?.find(d => d.player_index === playerIndex) || null;
        const otherSlotPlayer = currentDuo?.find(d => d.player_index !== playerIndex) || null;

        const [allPlayers, rosterPlayerIds] = await Promise.all([
            fetchAllPlayers(),
            fetchRosterPlayerIds(season.sleeper_league_id, team.sleeper_roster_id)
        ]);

        // Lock check: is the CURRENT player in this slot already mid/post-game
        // this week? If so, this slot can't be changed right now at all.
        let locked = false;
        if (currentPlayer?.sleeper_player_id) {
            const p = allPlayers[currentPlayer.sleeper_player_id];
            if (p?.team) {
                locked = await hasTeamGameStarted(p.team, season.current_week, String(season.year));
            }
        }

        const validPositions = awardType === 'nextup' ? NEXTUP_POSITIONS : MAIN_POSITIONS;
        const otherPlayerInfo = otherSlotPlayer?.sleeper_player_id
            ? { position: allPlayers[otherSlotPlayer.sleeper_player_id]?.position || otherSlotPlayer.player_position, yearsExp: allPlayers[otherSlotPlayer.sleeper_player_id]?.years_exp || 0 }
            : null;

        const candidates = rosterPlayerIds
            .filter(id => id !== otherSlotPlayer?.sleeper_player_id) // can't pick the same player twice
            .map(id => ({ id, player: allPlayers[id] }))
            .filter(({ player }) => player?.position && validPositions.has(player.position))
            .filter(({ player }) => {
                if (!otherPlayerInfo) return true; // other slot empty - no pairing constraint yet
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
