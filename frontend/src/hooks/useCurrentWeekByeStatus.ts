import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Season } from '../types';

/**
 * Sleeper player IDs on bye THIS week. Backed by weekly_scores' was_bye flag,
 * which the automation populates as soon as it runs for the week - schedule
 * data, not live score data, so this is accurate even before any games have
 * been played yet. Returns an empty set if the automation hasn't run for
 * this week yet (not wrong, just not populated - self-heals on the next run).
 */
export function useCurrentWeekByeStatus(season: Season | null): Set<string> {
    const [byePlayerIds, setByePlayerIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!season) return;

        let cancelled = false;

        async function load() {
            const { data, error } = await supabase
                .from('weekly_scores')
                .select('sleeper_player_id, was_bye')
                .eq('week', season!.current_week)
                .eq('was_bye', true);

            if (cancelled || error || !data) return;
            setByePlayerIds(new Set(data.map(r => r.sleeper_player_id)));
        }

        load();
        return () => { cancelled = true; };
    }, [season]);

    return byePlayerIds;
}
