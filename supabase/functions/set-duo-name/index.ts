// set-duo-name/index.ts
// POST { teamId, deviceToken, awardType, name } -> { success, error? }
//
// name can be null/empty to clear an existing nickname (skip/reset). Device-
// token authenticated - same pattern as set-duo, since this is still an
// owner-only write action.
//
// verify_jwt must be OFF for this function (see ../../config.toml).

import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';

Deno.serve(async (req: Request) => {
    const preflight = handleCorsPreflightRequest(req);
    if (preflight) return preflight;

    try {
        const { teamId, deviceToken, awardType, name } = await req.json();

        if (!teamId || !deviceToken || !['main', 'nextup'].includes(awardType)) {
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

        const trimmed = typeof name === 'string' ? name.trim() : '';

        if (trimmed.length === 0) {
            // Empty name = clear/skip - remove any existing nickname for this slot
            const { error: deleteError } = await supabase
                .from('duo_names').delete().eq('team_id', teamId).eq('award_type', awardType);
            if (deleteError) {
                return jsonResponse({ success: false, error: 'Failed to clear name' }, 500);
            }
            return jsonResponse({ success: true });
        }

        if (trimmed.length > 40) {
            return jsonResponse({ success: false, error: 'Name is too long (40 characters max)' }, 400);
        }

        const { error: upsertError } = await supabase.from('duo_names').upsert({
            team_id: teamId,
            award_type: awardType,
            name: trimmed
        }, { onConflict: 'team_id,award_type' });

        if (upsertError) {
            return jsonResponse({ success: false, error: 'Failed to save name' }, 500);
        }

        return jsonResponse({ success: true });

    } catch (err) {
        console.error('set-duo-name error:', err);
        return jsonResponse({ success: false, error: 'Unexpected server error' }, 500);
    }
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
