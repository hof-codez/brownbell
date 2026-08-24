// _shared/cors.ts
// Shared CORS headers - the frontend calls these functions from the browser
// (hof-codez.github.io), so every response needs these or the browser blocks it.

export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

export function handleCorsPreflightRequest(req: Request): Response | null {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }
    return null;
}
