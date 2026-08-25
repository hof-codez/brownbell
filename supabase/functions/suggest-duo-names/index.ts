// suggest-duo-names/index.ts
// POST { teamId, deviceToken, awardType } -> { success, suggestions: string[] }
//
// Looks up the team's CURRENT duo pair server-side (never trusts client-
// supplied player names, same principle as every other function here), then
// asks Claude Haiku for 5 short nickname ideas based strictly on those two
// real players. Device-token authenticated so a random visitor can't burn
// through your Anthropic budget.
//
// verify_jwt must be OFF for this function (see ../../config.toml).

import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { callClaudeForSuggestions } from '../_shared/anthropic.ts';

Deno.serve(async (req: Request) => {
    const preflight = handleCorsPreflightRequest(req);
    if (preflight) return preflight;

    try {
        const { teamId, deviceToken, awardType } = await req.json();

        if (!teamId || !deviceToken || !['main', 'nextup'].includes(awardType)) {
            return jsonResponse({ success: false, error: 'Missing or invalid input' }, 400);
        }

        const supabase = createAdminClient();

        // Auth: this device must be authorized for this team - same check as set-duo
        const { data: claim, error: claimError } = await supabase
            .from('team_claims').select('device_tokens').eq('team_id', teamId).maybeSingle();
        if (claimError || !claim) {
            return jsonResponse({ success: false, error: 'Team has not been claimed yet' }, 403);
        }
        const authorized = (claim.device_tokens || []).some((d: { token: string }) => d.token === deviceToken);
        if (!authorized) {
            return jsonResponse({ success: false, error: 'This device is not authorized for this team' }, 403);
        }

        const { data: duoRows, error: duoError } = await supabase
            .from('duos').select('player_index, player_name')
            .eq('team_id', teamId).eq('award_type', awardType);
        if (duoError) {
            return jsonResponse({ success: false, error: 'Failed to load duo' }, 500);
        }

        const player1 = duoRows?.find(d => d.player_index === 0)?.player_name;
        const player2 = duoRows?.find(d => d.player_index === 1)?.player_name;
        if (!player1 || !player2) {
            return jsonResponse({ success: false, error: 'Both slots need to be set before naming this duo' }, 400);
        }

        const prompt = `Suggest exactly 5 short, fun nickname ideas for a fantasy football "duo" pairing made up of these two real NFL players: "${player1}" and "${player2}".

Base every suggestion STRICTLY on these two players' actual names - wordplay, alliteration, rhyme, or combining parts of their names. Do not invent or reference stats, positions, teams, or anything not derivable from the names themselves. Keep each suggestion under 30 characters.

Respond with ONLY a JSON array of exactly 5 strings, nothing else - no preamble, no code fences, no explanation.`;

        let rawText: string;
        try {
            rawText = await callClaudeForSuggestions(prompt);
        } catch (err) {
            console.error('Anthropic call failed:', err);
            return jsonResponse({ success: false, error: 'Could not generate suggestions right now' }, 502);
        }

        const suggestions = parseSuggestions(rawText);
        if (suggestions.length === 0) {
            return jsonResponse({ success: false, error: 'Could not generate suggestions right now' }, 502);
        }

        return jsonResponse({ success: true, suggestions });

    } catch (err) {
        console.error('suggest-duo-names error:', err);
        return jsonResponse({ success: false, error: 'Unexpected server error' }, 500);
    }
});

// Tolerant of markdown fences or a preamble the model might add despite being
// asked for raw JSON only - extracts the first [...] block found.
function parseSuggestions(text: string): string[] {
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
        const parsed = JSON.parse(match[0]);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
            .map(x => x.trim().slice(0, 40))
            .slice(0, 5);
    } catch {
        return [];
    }
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
