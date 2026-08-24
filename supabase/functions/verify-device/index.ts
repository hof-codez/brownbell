// verify-device/index.ts
// POST { teamId, deviceToken } -> { valid: boolean }
//
// Used two ways: (1) the frontend calls this on load to confirm a cached
// device token from a previous claim is still good, before showing the
// authenticated "my team" view; (2) any future write action (setting a duo
// pick) should call this - or check inline - before touching the database,
// so a stale or tampered-with token in localStorage can never be trusted on
// its own. This function only ever confirms/denies; it never returns
// anything from team_claims itself (no pin_hash, no other devices' tokens).
//
// verify_jwt must be OFF for this function (see ../../config.toml).

import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req: Request) => {
    const preflight = handleCorsPreflightRequest(req);
    if (preflight) return preflight;

    try {
        const { teamId, deviceToken } = await req.json();

        if (!teamId || !deviceToken) {
            return jsonResponse({ valid: false }, 400);
        }

        const supabase = createAdminClient();
        const { data: claim } = await supabase
            .from('team_claims').select('device_tokens').eq('team_id', teamId).maybeSingle();

        const valid = !!claim?.device_tokens?.some((d: { token: string }) => d.token === deviceToken);
        return jsonResponse({ valid });

    } catch (err) {
        console.error('verify-device error:', err);
        return jsonResponse({ valid: false }, 500);
    }
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
