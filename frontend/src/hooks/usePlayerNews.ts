import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { PlayerNewsItem } from '../types';

interface UsePlayerNewsResult {
    items: PlayerNewsItem[];
    loading: boolean;
    error: string | null;
}

// Reads from player_news, which the Node automation keeps populated from
// RotoWire's free public RSS feed (see fetchAndSavePlayerNews in
// update-standings.js) - the frontend never fetches RotoWire directly.
export function usePlayerNews(sleeperPlayerId: string | null, limit = 15): UsePlayerNewsResult {
    const [items, setItems] = useState<PlayerNewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!sleeperPlayerId) {
            setItems([]);
            setLoading(false);
            return;
        }

        let cancelled = false;

        async function load() {
            setLoading(true);
            const { data, error: fetchError } = await supabase
                .from('player_news')
                .select('id, sleeper_player_id, player_name, headline, snippet, source_url, source_name, published_at')
                .eq('sleeper_player_id', sleeperPlayerId)
                .order('published_at', { ascending: false })
                .limit(limit);

            if (cancelled) return;

            if (fetchError) {
                setError(fetchError.message);
                setLoading(false);
                return;
            }

            setItems((data ?? []).map(row => ({
                id: row.id,
                sleeperPlayerId: row.sleeper_player_id,
                playerName: row.player_name,
                headline: row.headline,
                snippet: row.snippet,
                sourceUrl: row.source_url,
                sourceName: row.source_name,
                publishedAt: row.published_at
            })));
            setError(null);
            setLoading(false);
        }

        load();
        return () => { cancelled = true; };
    }, [sleeperPlayerId, limit]);

    return { items, loading, error };
}
