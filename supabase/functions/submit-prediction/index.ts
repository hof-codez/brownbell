// submit-prediction/index.ts
// POST { teamId, deviceToken, week, teamAId, teamBId, predictedWinnerTeamId } ->
//   { success, error? }
//
// teamId here is the VOTER, not necessarily a participant in the matchup -
// any claimed team can predict any of the week's 6 matchups, not just their
// own. Device-token validation proves the voter is who they claim to be,
// same as every other mutation in this app.
//
// Every check is authoritative, never trusted from the client:
//   - the matchup must be a REAL scheduled matchup for that week, confirmed
//     via the same deterministic schedule function the frontend uses to
//     preview upcoming weeks (_shared/bonusSchedule.ts) - not just any two
//     team ids the client happens to send
//   - the predicted winner must actually be one of the two teams
//   - voting locks once the EARLIEST of the 4 players involved (both
//     teams' current Brown Bell duo) has their own game start - the same
//     "can't act on information you shouldn't have yet" principle used
//     elsewhere in this app, just applied per-matchup rather than
//     per-player-slot
//
// A resubmission before lock overwrites the previous vote (upsert) rather
// than being rejected - people are allowed to change their mind.
//
// verify_jwt must be OFF for this function (see ../../config.toml).

import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { fetchAllPlayers } from '../_shared/sleeper.ts';
import { fetchWeekSchedule, getMinutesUntilKickoffFromSchedule } from '../_shared/nflSchedule.ts';
import { getScheduledMatchupsForWeek } from '../_shared/bonusSchedule.ts';

Deno.serve(async (req: Request) => {
    const preflight = handleCorsPreflightRequest(req);
    if (preflight) return preflight;

    try {
        const { teamId, deviceToken, week, teamAId, teamBId, predictedWinnerTeamId } = await req.json();

        if (!teamId || !deviceToken || !Number.isInteger(week) || week < 1 || week > 14 || !teamAId || !teamBId || !predictedWinnerTeamId) {
            return jsonResponse({ success: false, error: 'Missing or invalid input' }, 400);
        }
        if (teamAId === teamBId) {
            return jsonResponse({ success: false, error: 'Invalid matchup' }, 400);
        }
        if (predictedWinnerTeamId !== teamAId && predictedWinnerTeamId !== teamBId) {
            return jsonResponse({ success: false, error: 'Predicted winner must be one of the two teams in this matchup' }, 400);
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

        const { data: voterTeam, error: voterTeamError } = await supabase
            .from('teams').select('season_id').eq('id', teamId).maybeSingle();
        if (voterTeamError || !voterTeam) {
            return jsonResponse({ success: false, error: 'Voting team not found' }, 404);
        }

        const { data: season, error: seasonError } = await supabase
            .from('seasons').select('year').eq('id', voterTeam.season_id).maybeSingle();
        if (seasonError || !season) {
            return jsonResponse({ success: false, error: 'Season not found' }, 404);
        }

        const { data: allTeams, error: allTeamsError } = await supabase
            .from('teams').select('id, sleeper_roster_id').eq('season_id', voterTeam.season_id);
        if (allTeamsError || !allTeams) {
            return jsonResponse({ success: false, error: 'Could not load teams' }, 500);
        }

        const scheduledMatchups = getScheduledMatchupsForWeek(allTeams, week);
        const isRealMatchup = scheduledMatchups.some(
            ([a, b]) => (a === teamAId && b === teamBId) || (a === teamBId && b === teamAId)
        );
        if (!isRealMatchup) {
            return jsonResponse({ success: false, error: 'That is not a scheduled matchup for this week' }, 400);
        }

        const { data: duoRows, error: duoError } = await supabase
            .from('duos')
            .select('team_id, sleeper_player_id')
            .in('team_id', [teamAId, teamBId])
            .eq('award_type', 'main');
        if (duoError) {
            return jsonResponse({ success: false, error: 'Could not verify matchup lock status' }, 500);
        }

        const involvedPlayerIds = (duoRows ?? [])
            .map(r => r.sleeper_player_id)
            .filter((id): id is string => !!id);

        if (involvedPlayerIds.length > 0) {
            const allPlayers = await fetchAllPlayers();
            const weekSchedule = await fetchWeekSchedule(week, String(season.year));

            let earliestMinutes: number | null = null;
            for (const playerId of involvedPlayerIds) {
                const nflTeam = allPlayers[playerId]?.team;
                if (!nflTeam) continue;
                const minutes = getMinutesUntilKickoffFromSchedule(weekSchedule, nflTeam);
                if (minutes === 'bye' || minutes === null) continue;
                if (earliestMinutes === null || minutes < earliestMinutes) earliestMinutes = minutes;
            }

            if (earliestMinutes !== null && earliestMinutes <= 0) {
                return jsonResponse({ success: false, error: 'Voting has closed for this matchup - a game involved has already started' }, 409);
            }
        }

        const [sortedA, sortedB] = teamAId < teamBId ? [teamAId, teamBId] : [teamBId, teamAId];

        const { error: upsertError } = await supabase.from('matchup_predictions').upsert({
            season_id: voterTeam.season_id,
            week,
            voter_team_id: teamId,
            team_a_id: sortedA,
            team_b_id: sortedB,
            predicted_winner_team_id: predictedWinnerTeamId,
            updated_at: new Date().toISOString()
        }, { onConflict: 'voter_team_id,season_id,week,team_a_id,team_b_id' });

        if (upsertError) {
            console.error('Prediction upsert failed:', upsertError);
            return jsonResponse({ success: false, error: `Could not save prediction: ${upsertError.message}` }, 500);
        }

        return jsonResponse({ success: true });

    } catch (err) {
        console.error('submit-prediction error:', err);
        return jsonResponse({ success: false, error: 'Unexpected server error' }, 500);
    }
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
