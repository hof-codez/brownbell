// set-team-background/index.ts
// POST (multipart/form-data) { teamId, deviceToken, action, file?, opacity?, accentColor? } ->
//   { success, backgroundImageUrl?, backgroundOpacity?, accentColor?, error? }
//
// action is one of:
//   'upload'         - file required; opacity and accentColor optional,
//                       applied together in the same call if provided
//   'reset'          - removes the stored file and clears background_image_url
//                       (accent color is untouched - a separate personalization
//                       axis, resetting the image shouldn't also wipe it)
//   'set-appearance' - opacity and/or accentColor, whichever provided -
//                       adjusts an already-uploaded image's opacity and/or
//                       the accent color without re-uploading anything
//
// Device-token validation mirrors set-duo exactly - nothing here trusts the
// client beyond that proof of ownership. File size/MIME type and hex color
// format are all validated here as the real gate; the bucket's own limits
// (see 018-team-backgrounds.sql) and the column's own check constraint
// (see 020-team-accent-color.sql) are a second line of defense, not a
// substitute for validating before ever reaching the database.
//
// Stored at a FIXED, extension-less path (the team's id) with upsert:true,
// so every re-upload overwrites the previous file rather than accumulating
// orphaned ones regardless of what image type is uploaded each time -
// Storage serves the file by its stored content-type metadata, not by any
// extension in the path.
//
// verify_jwt must be OFF for this function (see ../../config.toml).

import { corsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';
import { createAdminClient } from '../_shared/supabaseAdmin.ts';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BUCKET = 'team-backgrounds';
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

Deno.serve(async (req: Request) => {
    const preflight = handleCorsPreflightRequest(req);
    if (preflight) return preflight;

    try {
        const form = await req.formData();
        const teamId = form.get('teamId');
        const deviceToken = form.get('deviceToken');
        const action = form.get('action');

        if (typeof teamId !== 'string' || typeof deviceToken !== 'string' || !['upload', 'reset', 'set-appearance'].includes(action as string)) {
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

        if (action === 'reset') {
            const { error: removeError } = await supabase.storage.from(BUCKET).remove([teamId]);
            if (removeError && !removeError.message?.toLowerCase().includes('not found')) {
                console.error('Failed to remove background file:', removeError);
                return jsonResponse({ success: false, error: 'Could not remove the current background - try again' }, 500);
            }

            const { error: updateError } = await supabase
                .from('teams').update({ background_image_url: null }).eq('id', teamId);
            if (updateError) {
                return jsonResponse({ success: false, error: 'Could not reset background' }, 500);
            }

            return jsonResponse({ success: true, backgroundImageUrl: null });
        }

        if (action === 'set-appearance') {
            const updatePayload: Record<string, unknown> = {};

            const opacityRaw = form.get('opacity');
            if (typeof opacityRaw === 'string') {
                const opacity = Number(opacityRaw);
                if (Number.isNaN(opacity) || opacity < 0 || opacity > 1) {
                    return jsonResponse({ success: false, error: 'Opacity must be a number between 0 and 1' }, 400);
                }
                updatePayload.background_opacity = opacity;
            }

            const accentColorRaw = form.get('accentColor');
            if (typeof accentColorRaw === 'string' && accentColorRaw.length > 0) {
                if (!HEX_COLOR_RE.test(accentColorRaw)) {
                    return jsonResponse({ success: false, error: 'Accent color must be a valid hex color (e.g. #FF5733)' }, 400);
                }
                updatePayload.accent_color = accentColorRaw;
            }

            if (Object.keys(updatePayload).length === 0) {
                return jsonResponse({ success: false, error: 'Nothing to update' }, 400);
            }

            const { error: updateError } = await supabase.from('teams').update(updatePayload).eq('id', teamId);
            if (updateError) {
                return jsonResponse({ success: false, error: 'Could not save changes' }, 500);
            }

            return jsonResponse({ success: true, backgroundOpacity: updatePayload.background_opacity, accentColor: updatePayload.accent_color });
        }

        // action === 'upload'
        const file = form.get('file');
        if (!(file instanceof File)) {
            return jsonResponse({ success: false, error: 'No image file provided' }, 400);
        }
        if (file.size > MAX_FILE_BYTES) {
            return jsonResponse({ success: false, error: 'Image must be 10 MB or smaller' }, 400);
        }
        if (!ALLOWED_MIME_TYPES.has(file.type)) {
            return jsonResponse({ success: false, error: 'Image must be JPEG, PNG, or WEBP' }, 400);
        }

        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(teamId, file, {
            contentType: file.type,
            upsert: true
        });
        if (uploadError) {
            console.error('Background upload failed:', uploadError);
            return jsonResponse({ success: false, error: `Upload failed: ${uploadError.message}` }, 500);
        }

        const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(teamId);
        const backgroundImageUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

        const updatePayload: Record<string, unknown> = { background_image_url: backgroundImageUrl };

        const opacityRaw = form.get('opacity');
        if (typeof opacityRaw === 'string') {
            const opacity = Number(opacityRaw);
            if (!Number.isNaN(opacity) && opacity >= 0 && opacity <= 1) {
                updatePayload.background_opacity = opacity;
            }
        }

        const accentColorRaw = form.get('accentColor');
        if (typeof accentColorRaw === 'string' && accentColorRaw.length > 0) {
            if (!HEX_COLOR_RE.test(accentColorRaw)) {
                return jsonResponse({ success: false, error: 'Accent color must be a valid hex color (e.g. #FF5733)' }, 400);
            }
            updatePayload.accent_color = accentColorRaw;
        }

        const { error: updateError } = await supabase.from('teams').update(updatePayload).eq('id', teamId);
        if (updateError) {
            return jsonResponse({ success: false, error: 'Image uploaded but could not save - try again' }, 500);
        }

        return jsonResponse({
            success: true,
            backgroundImageUrl,
            backgroundOpacity: updatePayload.background_opacity,
            accentColor: updatePayload.accent_color
        });

    } catch (err) {
        console.error('set-team-background error:', err);
        return jsonResponse({ success: false, error: 'Unexpected server error' }, 500);
    }
});

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
}
