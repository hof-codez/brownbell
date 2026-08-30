// send-taunt/index.ts
// POST { teamId, deviceToken, week, opponentTeamId, emoji } -> { success, error? }
//
// teamId is the SENDER. Device-token validation mirrors every other
// mutation in this app. No kickoff-timing restriction at all here - unlike
// duo picks or predictions, taunts are just banter and can be sent before,
// during, or after that week's games.
//
// The one thing that IS validated: sender and recipient must actually be
// this week's real scheduled matchup opponents - confirmed via the same
// deterministic schedule function used elsewhere (_shared/bonusSchedule.ts),
// not just trusted from whatever the client sends. The emoji itself is
// checked against a curated set server-side too - the picker only offers
// these, but that's a UI convenience, not the actual gate.
//
// verify_jwt must be OFF for this function (see ../../config.toml).

import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { getScheduledMatchupsForWeek } from '../_shared/bonusSchedule.ts';

// Mirrors the frontend's ALLOWED_TAUNT_EMOJI - keep both lists in sync.
const ALLOWED_EMOJI = new Set([
    '\u{1F3C8}', '\u{1F4AA}', '\u{1F624}', '\u{1F602}', '\u{1F921}', '\u{1F451}',
    '\u{1F525}', '\u{1F480}', '\u{1F40D}', '\u{1F923}', '\u{1F62D}', '\u{1F680}',
    '\u{1F3C6}', '\u{1F971}', '\u{1F422}', '\u{1F986}', '\u{1F91D}', '\u{1FAE1}',
    '\u{1F634}', '\u{1F3AF}', '\u26A1', '\u{1F9CA}', '\u{1F90F}', '\u{1F5D1}\uFE0F'
]);

Deno.serve(async (req: Request) => {
    const preflight = handleCorsPreflightRequest(req);
    if (preflight) return preflight;

    try {
        const { teamId, deviceToken, week, opponentTeamId, emoji } = await req.json();

        if (!teamId || !deviceToken || !Number.isInteger(week) || week < 1 || week > 14 || !opponentTeamId || !emoji) {
            return jsonResponse({ success: false, error: 'Missing or invalid input' }, 400);
        }
        if (teamId === opponentTeamId) {
            return jsonResponse({ success: false, error: 'Invalid matchup' }, 400);
        }
        if (!ALLOWED_EMOJI.has(emoji)) {
            return jsonResponse({ success: false, error: 'That emoji is not in the allowed set' }, 400);
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

        const { data: senderTeam, error: senderTeamError } = await supabase
            .from('teams').select('season_id').eq('id', teamId).maybeSingle();
        if (senderTeamError || !senderTeam) {
            return jsonResponse({ success: false, error: 'Sending team not found' }, 404);
        }

        const { data: allTeams, error: allTeamsError } = await supabase
            .from('teams').select('id, sleeper_roster_id').eq('season_id', senderTeam.season_id);
        if (allTeamsError || !allTeams) {
            return jsonResponse({ success: false, error: 'Could not load teams' }, 500);
        }

        const scheduledMatchups = getScheduledMatchupsForWeek(allTeams, week);
        const isRealMatchup = scheduledMatchups.some(
            ([a, b]) => (a === teamId && b === opponentTeamId) || (a === opponentTeamId && b === teamId)
        );
        if (!isRealMatchup) {
            return jsonResponse({ success: false, error: 'You are not matched up against that team this week' }, 400);
        }

        const { error: insertError } = await supabase.from('matchup_taunts').insert({
            season_id: senderTeam.season_id,
            week,
            sender_team_id: teamId,
            recipient_team_id: opponentTeamId,
            emoji
        });

        if (insertError) {
            console.error('Taunt insert failed:', insertError);
            return jsonResponse({ success: false, error: `Could not send: ${insertError.message}` }, 500);
        }

        return jsonResponse({ success: true });

    } catch (err) {
        console.error('send-taunt error:', err);
        return jsonResponse({ success: false, error: 'Unexpected server error' }, 500);
    }
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
