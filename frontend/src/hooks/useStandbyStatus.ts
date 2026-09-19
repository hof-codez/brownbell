import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { AwardType } from '../types';

export interface StandbyInfo {
    playerName: string;
    playerPosition: string;
}

interface UseStandbyStatusResult {
    standbyByKey: Map<string, StandbyInfo>;
    refetch: () => void;
}

/** Every active (un-consumed) standby the claimed team has set for the
 * current week, keyed by `${awardType}|${playerIndex}` - lets
 * DuoSlotDisplay show who's already picked instead of just offering to
 * set one, once an owner has actually done so. Owner-only, same as the
 * rest of the standby feature (setting one, and the option to set one
 * at all) - never fetched for another team's card. */
export function useStandbyStatus(teamId: string | null, week: number | null): UseStandbyStatusResult {
    const [standbyByKey, setStandbyByKey] = useState<Map<string, StandbyInfo>>(new Map());
    // Bumped after a successful set-standby save (see App.tsx's
    // StandbyPickerModal onDone) so the effect below re-runs and picks
    // up the just-saved choice immediately, rather than only reflecting
    // it on the next full page load.
    const [refetchTick, setRefetchTick] = useState(0);
    const refetch = useCallback(() => setRefetchTick(t => t + 1), []);

    useEffect(() => {
        if (!teamId || week === null) {
            setStandbyByKey(new Map());
            return;
        }

        let cancelled = false;

        async function load() {
            const { data, error } = await supabase
                .from('standby_substitutes')
                .select('award_type, player_index, standby_player_name, standby_player_position')
                .eq('team_id', teamId)
                .eq('week', week)
                .eq('consumed', false);

            if (cancelled) return;

            if (error) {
                console.error('Failed to load standby status (non-fatal):', error.message);
                setStandbyByKey(new Map());
                return;
            }

            const map = new Map<string, StandbyInfo>();
            for (const row of data ?? []) {
                map.set(`${row.award_type as AwardType}|${row.player_index}`, {
                    playerName: row.standby_player_name,
                    playerPosition: row.standby_player_position
                });
            }
            setStandbyByKey(map);
        }

        load();
        return () => { cancelled = true; };
    }, [teamId, week, refetchTick]);

    return { standbyByKey, refetch };
}

