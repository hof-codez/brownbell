import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface ScheduleTeamEntry {
    date: string | null;
}

export function useLockCountdown(seasonId: string | null) {
    const [lockTime, setLockTime] = useState<Date | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!seasonId) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        async function load() {
            // Always Week 1 specifically - that's when the first locks happen,
            // regardless of what week the season is currently on.
            const { data } = await supabase
                .from('schedule_snapshots')
                .select('teams')
                .eq('season_id', seasonId)
                .eq('week', 1)
                .maybeSingle();

            if (cancelled) return;

            const teams = data?.teams as Record<string, ScheduleTeamEntry> | undefined;
            if (teams) {
                const kickoffTimes = Object.values(teams)
                    .map(t => t.date)
                    .filter((d): d is string => !!d)
                    .map(d => new Date(d).getTime())
                    .filter(t => !isNaN(t));

                if (kickoffTimes.length > 0) {
                    setLockTime(new Date(Math.min(...kickoffTimes)));
                }
            }
            setLoading(false);
        }

        load();
        return () => { cancelled = true; };
    }, [seasonId]);

    return { lockTime, loading };
}
