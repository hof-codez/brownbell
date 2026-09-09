import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { dedupeNewsByHeadline } from '../lib/dedupeNewsByHeadline';
import type { PlayerNewsItem } from '../types';

interface UseTeamPlayerNewsResult {
    items: PlayerNewsItem[];
    loading: boolean;
    error: string | null;
}

// Same source as usePlayerNews, but for a set of players at once - used by
// the My Players tab to build one combined feed across a claimed team's
// current 6 players (Main Award, Next Up, and Season of Boom).
export function useTeamPlayerNews(sleeperPlayerIds: string[], limit = 30): UseTeamPlayerNewsResult {
    const [items, setItems] = useState<PlayerNewsItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Stable dependency key - an array literal recreated every render
    // would otherwise re-trigger this effect on every render even when
    // the actual set of ids hasn't changed.
    const idsKey = sleeperPlayerIds.slice().sort().join(',');

    useEffect(() => {
        const ids = idsKey ? idsKey.split(',') : [];
        if (ids.length === 0) {
            setItems([]);
            setLoading(false);
            return;
        }

        let cancelled = false;

        async function load() {
            setLoading(true);
            // Fetches a buffer beyond the display limit - see the matching
            // comment in usePlayerNews for why (syndicated content saved
            // under an identical headline from multiple outlets).
            const { data, error: fetchError } = await supabase
                .from('player_news')
                .select('id, sleeper_player_id, player_name, headline, snippet, source_url, source_name, published_at')
                .in('sleeper_player_id', ids)
                .order('published_at', { ascending: false })
                .limit(limit * 2);

            if (cancelled) return;

            if (fetchError) {
                setError(fetchError.message);
                setLoading(false);
                return;
            }

            const mapped = (data ?? []).map(row => ({
                id: row.id,
                sleeperPlayerId: row.sleeper_player_id,
                playerName: row.player_name,
                headline: row.headline,
                snippet: row.snippet,
                sourceUrl: row.source_url,
                sourceName: row.source_name,
                publishedAt: row.published_at
            }));
            setItems(dedupeNewsByHeadline(mapped).slice(0, limit));
            setError(null);
            setLoading(false);
        }

        load();
        return () => { cancelled = true; };
    }, [idsKey, limit]);

    return { items, loading, error };
}
