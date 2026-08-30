import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { MatchupTaunt } from '../types';

export const ALLOWED_TAUNT_EMOJI = [
    '\u{1F3C8}', '\u{1F4AA}', '\u{1F624}', '\u{1F602}', '\u{1F921}', '\u{1F451}',
    '\u{1F525}', '\u{1F480}', '\u{1F40D}', '\u{1F923}', '\u{1F62D}', '\u{1F680}',
    '\u{1F3C6}', '\u{1F971}', '\u{1F422}', '\u{1F986}', '\u{1F91D}', '\u{1FAE1}',
    '\u{1F634}', '\u{1F3AF}', '\u26A1', '\u{1F9CA}', '\u{1F90F}', '\u{1F5D1}\uFE0F'
];

interface TauntRow {
    id: string;
    week: number;
    sender_team_id: string;
    recipient_team_id: string;
    emoji: string;
    created_at: string;
}

interface UseTauntsResult {
    loading: boolean;
    error: string | null;
    sending: boolean;
    getTauntsFor: (week: number, teamAId: string, teamBId: string) => MatchupTaunt[];
    sendTaunt: (senderTeamId: string, deviceToken: string, week: number, opponentTeamId: string, emoji: string) => Promise<{ success: boolean; error?: string }>;
}

export function useTaunts(): UseTauntsResult {
    const [rows, setRows] = useState<TauntRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sending, setSending] = useState(false);
    const [refetchToken, setRefetchToken] = useState(0);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            const { data, error: fetchError } = await supabase
                .from('matchup_taunts')
                .select('id, week, sender_team_id, recipient_team_id, emoji, created_at')
                .order('created_at', { ascending: true });

            if (cancelled) return;

            if (fetchError) {
                setError(fetchError.message);
                setLoading(false);
                return;
            }

            setRows(data ?? []);
            setError(null);
            setLoading(false);
        }

        load();
        return () => { cancelled = true; };
    }, [refetchToken]);

    const getTauntsFor = useCallback((week: number, teamAId: string, teamBId: string): MatchupTaunt[] => {
        return rows
            .filter(r =>
                r.week === week &&
                ((r.sender_team_id === teamAId && r.recipient_team_id === teamBId) ||
                 (r.sender_team_id === teamBId && r.recipient_team_id === teamAId))
            )
            .map(r => ({
                id: r.id,
                week: r.week,
                senderTeamId: r.sender_team_id,
                recipientTeamId: r.recipient_team_id,
                emoji: r.emoji,
                createdAt: r.created_at
            }));
    }, [rows]);

    const sendTaunt = useCallback(async (senderTeamId: string, deviceToken: string, week: number, opponentTeamId: string, emoji: string) => {
        setSending(true);
        const { data, error: fnError } = await supabase.functions.invoke('send-taunt', {
            body: { teamId: senderTeamId, deviceToken, week, opponentTeamId, emoji }
        });
        setSending(false);

        if (fnError || !data?.success) {
            return { success: false, error: data?.error || 'Could not send - try again.' };
        }
        setRefetchToken(t => t + 1);
        return { success: true };
    }, []);

    return { loading, error, sending, getTauntsFor, sendTaunt };
}
