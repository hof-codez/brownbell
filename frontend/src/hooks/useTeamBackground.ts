import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface BackgroundResult {
    success: boolean;
    backgroundImageUrl?: string | null;
    backgroundOpacity?: number;
    error?: string;
}

interface UseTeamBackgroundResult {
    saving: boolean;
    uploadBackground: (file: File, opacity: number) => Promise<BackgroundResult>;
    resetBackground: () => Promise<BackgroundResult>;
    setOpacity: (opacity: number) => Promise<BackgroundResult>;
}

// Every call sends multipart/form-data - Supabase's client detects a
// FormData body and sets the right content-type automatically rather than
// JSON-stringifying it, which is what makes sending an actual file through
// an Edge Function possible at all.
export function useTeamBackground(teamId: string, deviceToken: string): UseTeamBackgroundResult {
    const [saving, setSaving] = useState(false);

    const invoke = useCallback(async (form: FormData): Promise<BackgroundResult> => {
        setSaving(true);
        const { data, error: fnError } = await supabase.functions.invoke('set-team-background', { body: form });
        setSaving(false);

        if (fnError || !data?.success) {
            return { success: false, error: data?.error || 'Could not save - try again.' };
        }
        return data as BackgroundResult;
    }, []);

    const uploadBackground = useCallback((file: File, opacity: number) => {
        const form = new FormData();
        form.set('teamId', teamId);
        form.set('deviceToken', deviceToken);
        form.set('action', 'upload');
        form.set('file', file);
        form.set('opacity', String(opacity));
        return invoke(form);
    }, [teamId, deviceToken, invoke]);

    const resetBackground = useCallback(() => {
        const form = new FormData();
        form.set('teamId', teamId);
        form.set('deviceToken', deviceToken);
        form.set('action', 'reset');
        return invoke(form);
    }, [teamId, deviceToken, invoke]);

    const setOpacity = useCallback((opacity: number) => {
        const form = new FormData();
        form.set('teamId', teamId);
        form.set('deviceToken', deviceToken);
        form.set('action', 'set-opacity');
        form.set('opacity', String(opacity));
        return invoke(form);
    }, [teamId, deviceToken, invoke]);

    return { saving, uploadBackground, resetBackground, setOpacity };
}
