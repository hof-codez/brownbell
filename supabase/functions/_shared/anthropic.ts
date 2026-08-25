// _shared/anthropic.ts
// Minimal wrapper for calling Anthropic's API from an Edge Function. Uses
// Claude Haiku 4.5 - the current low-cost model - since this is a small,
// low-stakes creative task (5 short name suggestions), not something that
// benefits from a larger model. Requires ANTHROPIC_API_KEY set as a Supabase
// function secret (a real, separate cost from Supabase itself - this is
// billed on the Anthropic account, not Supabase).

const LOW_COST_MODEL = 'claude-haiku-4-5-20251001';

export async function callClaudeForSuggestions(prompt: string): Promise<string> {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not set as a Supabase function secret');
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model: LOW_COST_MODEL,
            max_tokens: 300,
            messages: [{ role: 'user', content: prompt }]
        })
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Anthropic API error (${res.status}): ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const text = data?.content?.[0]?.text;
    if (typeof text !== 'string') {
        throw new Error('Unexpected response shape from Anthropic API');
    }
    return text;
}
