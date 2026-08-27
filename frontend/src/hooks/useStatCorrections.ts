import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Team } from '../types';

export interface StatCorrection {
    id: string;
    teamId: string;
    teamName: string;
    week: number;
    originalTeamScore: number;
    correctedTeamScore: number;
    originalOutcome: string;
    correctedOutcome: string;
    originalTier: number | null;
    correctedTier: number | null;
    originalBonusPoints: number;
    correctedBonusPoints: number;
    detectedAt: string;
}

export function useStatCorrections(teams: Team[]) {
    const [corrections, setCorrections] = useState<StatCorrection[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (teams.length === 0) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        async function load() {
            const teamIds = teams.map(t => t.id);
            const { data, error: fetchError } = await supabase
                .from('bonus_result_corrections')
                .select('id, team_id, week, original_team_score, corrected_team_score, original_outcome, corrected_outcome, original_tier, corrected_tier, original_bonus_points, corrected_bonus_points, detected_at')
                .in('team_id', teamIds)
                .order('detected_at', { ascending: false });

            if (cancelled) return;

            if (fetchError) {
                setError(fetchError.message);
                setLoading(false);
                return;
            }

            const teamNameById: Record<string, string> = {};
            teams.forEach(t => { teamNameById[t.id] = t.display_name; });

            const mapped: StatCorrection[] = (data ?? []).map(row => ({
                id: row.id,
                teamId: row.team_id,
                teamName: teamNameById[row.team_id] || 'Unknown',
                week: row.week,
                originalTeamScore: Number(row.original_team_score),
                correctedTeamScore: Number(row.corrected_team_score),
                originalOutcome: row.original_outcome,
                correctedOutcome: row.corrected_outcome,
                originalTier: row.original_tier,
                correctedTier: row.corrected_tier,
                originalBonusPoints: Number(row.original_bonus_points),
                correctedBonusPoints: Number(row.corrected_bonus_points),
                detectedAt: row.detected_at
            }));

            if (!cancelled) {
                setCorrections(mapped);
                setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [teams]);

    return { corrections, loading, error };
}
