import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { AwardType, EligibleRosterResponse } from '../types';

interface UseDuoPickerResult {
    fetching: boolean;
    saving: boolean;
    error: string | null;
    fetchEligible: (awardType: AwardType, playerIndex: 0 | 1) => Promise<EligibleRosterResponse | null>;
    setDuo: (awardType: AwardType, playerIndex: 0 | 1, sleeperPlayerId: string) => Promise<{ success: boolean; error?: string }>;
}

export function useDuoPicker(teamId: string, deviceToken: string): UseDuoPickerResult {
    const [fetching, setFetching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchEligible = useCallback(async (awardType: AwardType, playerIndex: 0 | 1) => {
        setFetching(true);
        setError(null);

        const { data, error: fnError } = await supabase.functions.invoke('get-eligible-roster', {
            body: { teamId, awardType, playerIndex }
        });

        setFetching(false);

        if (fnError || data?.error) {
            setError(data?.error || 'Could not load your roster - try again.');
            return null;
        }
        return data as EligibleRosterResponse;
    }, [teamId]);

    const setDuo = useCallback(async (awardType: AwardType, playerIndex: 0 | 1, sleeperPlayerId: string) => {
        setSaving(true);
        setError(null);

        const { data, error: fnError } = await supabase.functions.invoke('set-duo', {
            body: { teamId, deviceToken, awardType, playerIndex, sleeperPlayerId }
        });

        setSaving(false);

        if (fnError || !data?.success) {
            const message = data?.error || 'Could not save your pick - try again.';
            setError(message);
            return { success: false, error: message };
        }
        return { success: true };
    }, [teamId, deviceToken]);

    return { fetching, saving, error, fetchEligible, setDuo };
}
