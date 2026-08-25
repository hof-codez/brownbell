import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Team, AwardType } from '../types';

interface UseDuoNamesResult {
    names: Map<string, string>;
    refetch: () => void;
}

/** Keyed by `${teamId}|${awardType}` -> custom duo name, only present when one's been set. */
export function useDuoNames(teams: Team[]): UseDuoNamesResult {
    const [names, setNames] = useState<Map<string, string>>(new Map());
    const [refetchTick, setRefetchTick] = useState(0);
    const refetch = useCallback(() => setRefetchTick(t => t + 1), []);

    useEffect(() => {
        if (teams.length === 0) return;
        let cancelled = false;

        async function load() {
            const teamIds = teams.map(t => t.id);
            const { data, error } = await supabase
                .from('duo_names')
                .select('team_id, award_type, name')
                .in('team_id', teamIds);

            if (cancelled || error || !data) return;
            const map = new Map<string, string>();
            data.forEach(row => map.set(`${row.team_id}|${row.award_type}`, row.name));
            setNames(map);
        }

        load();
        return () => { cancelled = true; };
    }, [teams, refetchTick]);

    return { names, refetch };
}

export function duoNameKey(teamId: string, awardType: AwardType): string {
    return `${teamId}|${awardType}`;
}
