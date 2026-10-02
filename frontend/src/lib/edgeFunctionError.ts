// supabase-js doesn't parse the response body into `data` when an Edge
// Function returns a non-2xx status - it only sets `error`, leaving
// `data` null. Every Edge Function's own specific, helpful rejection
// reasons (e.g. "no eligible replacement exists for this slot") were
// silently discarded and replaced by a generic fallback - confirmed as a
// real reported case where a 400 rejection only ever showed "Could not
// save that standby - try again", never the actual reason. The real
// message lives on the error's own `context` (the raw Response object)
// and has to be read back out manually.
export async function extractEdgeFunctionError(fnError: unknown): Promise<string | undefined> {
    if (!fnError || typeof fnError !== 'object' || !('context' in fnError)) return undefined;
    try {
        const body = await (fnError as { context: Response }).context.json();
        return body?.error;
    } catch {
        return undefined; // body wasn't JSON, or already consumed
    }
}
