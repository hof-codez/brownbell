import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { NFLGameInfo } from '../types';
import { isLastGameOfWeek } from '../lib/isLastGameOfWeek';

interface UseNFLScheduleResult {
    loading: boolean;
    error: string | null;
    getGameInfo: (nflTeam: string | null) => NFLGameInfo | undefined;
    /** Whether a given NFL team's game is the LAST one of the week - used
     * to decide when to show the standby substitute option (see
     * StandbyPickerModal.tsx), since that only ever applies when a duo
     * member's own game is the one nothing else this week kicks off
     * later than. */
    isLastGameOfWeek: (nflTeam: string | null) => boolean;
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

    function checkIsLastGameOfWeek(nflTeam: string | null): boolean {
        return isLastGameOfWeek(scheduleByTeam, nflTeam);
    }

    return { loading, error, getGameInfo, isLastGameOfWeek: checkIsLastGameOfWeek };
}
