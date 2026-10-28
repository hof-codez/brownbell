import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { loadCachedClaim } from '../lib/deviceStorage';

export interface FeedAsset {
    id: string;
    name: string;
    position: string | null;
    pickYear: number | null;
    pickRound: number | null;
    value: number;
}

export interface FeedSide {
    id: string | null;
    name: string;
    gave: FeedAsset[];
}

export interface FeedTrade {
    id: string;
    happenedAt: string;
    teamA: FeedSide;
    teamB: FeedSide;
    winner: 'a' | 'b' | 'even';
    gapPct: number;
}

// Only fetches once `enabled` flips on (the section is collapsed by default), so opening
// the History tab alone never costs a trade-feed request.
export function useTradeFeed(enabled: boolean) {
    const [trades, setTrades] = useState<FeedTrade[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!enabled || trades !== null) return;
        const claim = loadCachedClaim();
        if (!claim) return;
        let cancelled = false;
        supabase.functions
            .invoke('tc-api', { body: { action: 'trade_feed', deviceToken: claim.deviceToken } })
            .then(({ data, error: err }) => {
                if (cancelled) return;
                if (err || !data?.trades) setError('Could not load trades right now.');
                else setTrades(data.trades as FeedTrade[]);
            });
        return () => { cancelled = true; };
    }, [enabled, trades]);

    return { trades, error };
}
