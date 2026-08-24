// _shared/supabaseAdmin.ts
// Creates a service-role Supabase client for use inside Edge Functions only -
// never send this client's key to a browser. Supabase is mid-migration (2026)
// between the legacy SUPABASE_SERVICE_ROLE_KEY and the newer
// SUPABASE_SECRET_KEYS JSON map, and which one a given project auto-populates
// isn't something this code can assume - so it checks both rather than
// guessing and silently failing on whichever generation this project turns
// out to be.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function resolveServiceKey(): string {
    const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (legacy) return legacy;

    const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS');
    if (secretKeysRaw) {
        try {
            const secretKeys = JSON.parse(secretKeysRaw);
            if (secretKeys.default) return secretKeys.default;
        } catch {
            // fall through to the error below
        }
    }

    throw new Error(
        'No service-role key found in the environment (checked SUPABASE_SERVICE_ROLE_KEY and SUPABASE_SECRET_KEYS). ' +
        'This should be auto-populated by Supabase - check the function logs if this fires.'
    );
}

export function createAdminClient() {
    const url = Deno.env.get('SUPABASE_URL');
    if (!url) throw new Error('SUPABASE_URL not found in environment');
    return createClient(url, resolveServiceKey());
}
