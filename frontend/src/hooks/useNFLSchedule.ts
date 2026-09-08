import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { NFLGameInfo } from '../types';

interface UseNFLScheduleResult {
    loading: boolean;
    error: string | null;
    getGameInfo: (nflTeam: string | null) => NFLGameInfo | undefined;
}

// Reads from nfl_schedule, which the Node automation keeps populated every
// run (see saveNFLSchedule/fetchNFLSchedule in update-standings.js) - the
// frontend never calls ESPN or Sleeper directly for this.
export function useNFLSchedule(week: number | null): UseNFLScheduleResult {
    const [scheduleByTeam, setScheduleByTeam] = useState<Map<string, NFLGameInfo>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (week === null) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        async function load() {
            setLoading(true);
            const { data, error: fetchError } = await supabase
                .from('nfl_schedule')
                .select('nfl_team, opponent_nfl_team, kickoff_time, is_bye')
                .eq('week', week);

            if (cancelled) return;

            if (fetchError) {
                setError(fetchError.message);
                setLoading(false);
                return;
            }

            setScheduleByTeam(new Map((data ?? []).map(row => [row.nfl_team, row])));
            setError(null);
            setLoading(false);
        }

        load();
        return () => { cancelled = true; };
    }, [week]);

    function getGameInfo(nflTeam: string | null): NFLGameInfo | undefined {
        if (!nflTeam) return undefined;
        return scheduleByTeam.get(nflTeam);
    }

    return { loading, error, getGameInfo };
}
