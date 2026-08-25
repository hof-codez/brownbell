import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { AwardType } from '../types';

interface UseDuoNamingResult {
    suggesting: boolean;
    saving: boolean;
    error: string | null;
    getSuggestions: (awardType: AwardType) => Promise<string[] | null>;
    saveName: (awardType: AwardType, name: string) => Promise<boolean>;
}

export function useDuoNaming(teamId: string, deviceToken: string): UseDuoNamingResult {
    const [suggesting, setSuggesting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const getSuggestions = useCallback(async (awardType: AwardType) => {
        setSuggesting(true);
        setError(null);

        const { data, error: fnError } = await supabase.functions.invoke('suggest-duo-names', {
            body: { teamId, deviceToken, awardType }
        });

        setSuggesting(false);

        if (fnError || !data?.success) {
            setError(data?.error || 'Could not generate suggestions - try again.');
            return null;
        }
        return data.suggestions as string[];
    }, [teamId, deviceToken]);

    // Pass an empty string to clear/skip - the same action either way.
    const saveName = useCallback(async (awardType: AwardType, name: string) => {
        setSaving(true);
        setError(null);

        const { data, error: fnError } = await supabase.functions.invoke('set-duo-name', {
            body: { teamId, deviceToken, awardType, name }
        });

        setSaving(false);

        if (fnError || !data?.success) {
            setError(data?.error || 'Could not save - try again.');
            return false;
        }
        return true;
    }, [teamId, deviceToken]);

    return { suggesting, saving, error, getSuggestions, saveName };
}
