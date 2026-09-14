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
//
// Runs one query PER PLAYER (each capped at perPlayerLimit), rather than
// one shared query across every player's ids sorted by date and trimmed
// to one overall total. Confirmed as a real reported bug with that
// earlier design: a single combined query lets a few high-volume
// players' recent news crowd a quieter player's older-but-still-recent
// articles out of the shared cutoff entirely, even though nothing was
// ever deleted - clicking that player's own tab then shows almost
// nothing, since the underlying fetch never gave him a fair share to
// begin with. Every player is now guaranteed their own room in the feed
// regardless of how much news anyone else has. The combined "All" tab
// naturally ends up as (fetched players x perPlayerLimit) items at most,
// which callers should size perPlayerLimit around for their own display
// needs - this hook applies no further overall trim itself.
export function useTeamPlayerNews(sleeperPlayerIds: string[], perPlayerLimit = 5): UseTeamPlayerNewsResult {
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

            // Fetches a small buffer beyond perPlayerLimit per player -
            // same reasoning as usePlayerNews - so a player with several
            // syndicated duplicates doesn't end up with fewer than
            // perPlayerLimit genuinely unique articles after dedup below.
            const fetchLimit = perPlayerLimit * 2;

            const results = await Promise.all(
                ids.map(id =>
                    supabase
                        .from('player_news')
                        .select('id, sleeper_player_id, player_name, headline, snippet, source_url, source_name, published_at')
                        .eq('sleeper_player_id', id)
                        .order('published_at', { ascending: false })
                        .limit(fetchLimit)
                )
            );

            if (cancelled) return;

            const firstError = results.find(r => r.error)?.error;
            if (firstError) {
                setError(firstError.message);
                setLoading(false);
                return;
            }

            // Deduped PER PLAYER first, so each player's own perPlayerLimit
            // worth of genuinely unique articles is preserved independently
            // - deduping only after combining everyone could otherwise let
            // one player's duplicate-heavy news eat into another's share.
            const mapped = results.flatMap(r => {
                const playerMapped = (r.data ?? []).map(row => ({
                    id: row.id,
                    sleeperPlayerId: row.sleeper_player_id,
                    playerName: row.player_name,
                    headline: row.headline,
                    snippet: row.snippet,
                    sourceUrl: row.source_url,
                    sourceName: row.source_name,
                    publishedAt: row.published_at
                }));
                return dedupeNewsByHeadline(playerMapped).slice(0, perPlayerLimit);
            });

            mapped.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
            setItems(mapped);
            setError(null);
            setLoading(false);
        }

        load();
        return () => { cancelled = true; };
    }, [idsKey, perPlayerLimit]);

    return { items, loading, error };
}
