import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

interface BackgroundResult {
    success: boolean;
    backgroundImageUrl?: string | null;
    backgroundOpacity?: number;
    accentColor?: string;
    error?: string;
}

interface UseTeamBackgroundResult {
    saving: boolean;
    uploadBackground: (file: File, opacity: number, accentColor?: string | null) => Promise<BackgroundResult>;
    resetBackground: () => Promise<BackgroundResult>;
    setAppearance: (changes: { opacity?: number; accentColor?: string | null }) => Promise<BackgroundResult>;
}

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

    const uploadBackground = useCallback((file: File, opacity: number, accentColor?: string | null) => {
        const form = new FormData();
        form.set('teamId', teamId);
        form.set('deviceToken', deviceToken);
        form.set('action', 'upload');
        form.set('file', file);
        form.set('opacity', String(opacity));
        if (accentColor) form.set('accentColor', accentColor);
        return invoke(form);
    }, [teamId, deviceToken, invoke]);

    const resetBackground = useCallback(() => {
        const form = new FormData();
        form.set('teamId', teamId);
        form.set('deviceToken', deviceToken);
        form.set('action', 'reset');
        return invoke(form);
    }, [teamId, deviceToken, invoke]);

    const setAppearance = useCallback((changes: { opacity?: number; accentColor?: string | null }) => {
        const form = new FormData();
        form.set('teamId', teamId);
        form.set('deviceToken', deviceToken);
        form.set('action', 'set-appearance');
        if (changes.opacity !== undefined) form.set('opacity', String(changes.opacity));
        if (changes.accentColor) form.set('accentColor', changes.accentColor);
        return invoke(form);
    }, [teamId, deviceToken, invoke]);

    return { saving, uploadBackground, resetBackground, setAppearance };
}
