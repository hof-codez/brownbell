import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { AwardType, EligibleRosterResponse } from '../types';

interface UseStandbyPickerResult {
    fetching: boolean;
    saving: boolean;
    error: string | null;
    // Reuses get-eligible-roster directly - a candidate's own game
    // having already started is checked there identically to what a
    // standby actually needs, so there's no separate eligibility
    // endpoint just for this.
    fetchEligible: (awardType: AwardType, playerIndex: 0 | 1) => Promise<EligibleRosterResponse | null>;
    setStandby: (awardType: AwardType, playerIndex: 0 | 1, sleeperPlayerId: string) => Promise<{ success: boolean; error?: string }>;
}

export function useStandbyPicker(teamId: string, deviceToken: string): UseStandbyPickerResult {
    const [fetching, setFetching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchEligible = useCallback(async (awardType: AwardType, playerIndex: 0 | 1) => {
        setFetching(true);
        setError(null);

        const { data, error: fnError } = await supabase.functions.invoke('get-eligible-roster', {
            body: { teamId, awardType, playerIndex, forStandby: true }
        });

        setFetching(false);

        if (fnError || data?.error) {
            setError(data?.error || 'Could not load your roster - try again.');
            return null;
        }
        return data as EligibleRosterResponse;
    }, [teamId]);

    const setStandby = useCallback(async (awardType: AwardType, playerIndex: 0 | 1, standbySleeperPlayerId: string) => {
        setSaving(true);
        setError(null);

        const { data, error: fnError } = await supabase.functions.invoke('set-standby', {
            body: { teamId, deviceToken, awardType, playerIndex, standbySleeperPlayerId }
        });

        setSaving(false);

        if (fnError || !data?.success) {
            const message = data?.error || 'Could not save that standby - try again.';
            setError(message);
            return { success: false, error: message };
        }
        return { success: true };
    }, [teamId, deviceToken]);

    return { fetching, saving, error, fetchEligible, setStandby };
}
