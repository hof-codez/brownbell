// claim-team/index.ts
// POST { teamId, pin } -> { success, deviceToken, action: 'claimed'|'unlocked' }
//                      or { success: false, error }
//
// One unified endpoint for both cases, so the frontend never needs to know in
// advance whether a team has been claimed yet - it just always asks for a PIN:
//   - No existing claim for this team -> this PIN becomes the team's PIN,
//     first device is authorized. action: 'claimed'.
//   - Existing claim -> PIN must match the stored one. If it does, this
//     device is added as another authorized device (e.g. a second phone).
//     action: 'unlocked'.
//   - Existing claim, wrong PIN -> success: false.
//
// verify_jwt must be OFF for this function (see ../../config.toml) - there's
// no Supabase Auth user session here, this implements its own PIN-based auth.

import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';
import { hashPin, verifyPin } from '../_shared/pin.ts';

const PIN_PATTERN = /^\d{4,8}$/;

Deno.serve(async (req: Request) => {
    const preflight = handleCorsPreflightRequest(req);
    if (preflight) return preflight;

    try {
        const { teamId, pin, deviceLabel } = await req.json();

        if (!teamId || typeof teamId !== 'string') {
            return jsonResponse({ success: false, error: 'Missing teamId' }, 400);
        }
        if (!pin || typeof pin !== 'string' || !PIN_PATTERN.test(pin)) {
            return jsonResponse({ success: false, error: 'PIN must be 4-8 digits' }, 400);
        }

        const supabase = createAdminClient();

        // Confirm the team actually exists before doing anything else
        const { data: team, error: teamError } = await supabase
            .from('teams').select('id').eq('id', teamId).maybeSingle();
        if (teamError || !team) {
            return jsonResponse({ success: false, error: 'Team not found' }, 404);
        }

        const { data: existingClaim, error: claimError } = await supabase
            .from('team_claims').select('id, pin_hash, device_tokens').eq('team_id', teamId).maybeSingle();
        if (claimError) {
            return jsonResponse({ success: false, error: 'Failed to check claim status' }, 500);
        }

        const deviceToken = crypto.randomUUID();
        const newDeviceEntry = { token: deviceToken, label: deviceLabel || 'device', added_at: new Date().toISOString() };

        if (!existingClaim) {
            // First claim for this team - this PIN becomes the team's PIN
            const pinHash = await hashPin(pin);
            const { error: insertError } = await supabase.from('team_claims').insert({
                team_id: teamId,
                pin_hash: pinHash,
                device_tokens: [newDeviceEntry]
            });
            if (insertError) {
                return jsonResponse({ success: false, error: 'Failed to create claim' }, 500);
            }
            return jsonResponse({ success: true, deviceToken, action: 'claimed' });
        }

        // Existing claim - PIN must match
        const valid = await verifyPin(pin, existingClaim.pin_hash);
        if (!valid) {
            return jsonResponse({ success: false, error: 'Incorrect PIN' }, 401);
        }

        const updatedTokens = [...(existingClaim.device_tokens || []), newDeviceEntry];
        const { error: updateError } = await supabase
            .from('team_claims')
            .update({ device_tokens: updatedTokens, updated_at: new Date().toISOString() })
            .eq('id', existingClaim.id);
        if (updateError) {
            return jsonResponse({ success: false, error: 'Failed to authorize this device' }, 500);
        }

        return jsonResponse({ success: true, deviceToken, action: 'unlocked' });

    } catch (err) {
        console.error('claim-team error:', err);
        return jsonResponse({ success: false, error: 'Unexpected server error' }, 500);
    }
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
