// set-team-background/index.ts
// POST (multipart/form-data) { teamId, deviceToken, action, file?, opacity? } ->
//   { success, backgroundImageUrl?, backgroundOpacity?, error? }
//
// action is one of:
//   'upload'      - file required, opacity optional (defaults kept if omitted)
//   'reset'       - removes the stored file and clears background_image_url
//   'set-opacity' - opacity required, adjusts an already-uploaded image
//                   without re-uploading it
//
// Device-token validation mirrors set-duo exactly - nothing here trusts the
// client beyond that proof of ownership. File size and MIME type are
// validated here as the real gate; the bucket's own limits (see
// 018-team-backgrounds.sql) are a second line of defense, not a substitute.
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

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const BUCKET = 'team-backgrounds';

Deno.serve(async (req: Request) => {
    const preflight = handleCorsPreflightRequest(req);
    if (preflight) return preflight;

    try {
        const form = await req.formData();
        const teamId = form.get('teamId');
        const deviceToken = form.get('deviceToken');
        const action = form.get('action');

        if (typeof teamId !== 'string' || typeof deviceToken !== 'string' || !['upload', 'reset', 'set-opacity'].includes(action as string)) {
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
            // A "not found" removal is fine (nothing was ever uploaded) - only
            // a genuine storage failure should block clearing the column.
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

        if (action === 'set-opacity') {
            const opacityRaw = form.get('opacity');
            const opacity = typeof opacityRaw === 'string' ? Number(opacityRaw) : NaN;
            if (Number.isNaN(opacity) || opacity < 0 || opacity > 1) {
                return jsonResponse({ success: false, error: 'Opacity must be a number between 0 and 1' }, 400);
            }

            const { error: updateError } = await supabase
                .from('teams').update({ background_opacity: opacity }).eq('id', teamId);
            if (updateError) {
                return jsonResponse({ success: false, error: 'Could not update opacity' }, 500);
            }

            return jsonResponse({ success: true, backgroundOpacity: opacity });
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
        // Cache-bust so a re-upload at the same path is reflected immediately
        // rather than showing a stale cached image at the same URL.
        const backgroundImageUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

        const opacityRaw = form.get('opacity');
        const updatePayload: Record<string, unknown> = { background_image_url: backgroundImageUrl };
        if (typeof opacityRaw === 'string') {
            const opacity = Number(opacityRaw);
            if (!Number.isNaN(opacity) && opacity >= 0 && opacity <= 1) {
                updatePayload.background_opacity = opacity;
            }
        }

        const { error: updateError } = await supabase.from('teams').update(updatePayload).eq('id', teamId);
        if (updateError) {
            return jsonResponse({ success: false, error: 'Image uploaded but could not save - try again' }, 500);
        }

        return jsonResponse({ success: true, backgroundImageUrl, backgroundOpacity: updatePayload.background_opacity });

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
