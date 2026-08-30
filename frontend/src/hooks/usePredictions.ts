import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Matchup } from './useBonusResults';
import type { Team } from '../types';

const BLOCKS: number[][] = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14]];
const POINTS_PER_BLOCK = 12;

interface PredictionRow {
    week: number;
    voter_team_id: string;
    team_a_id: string;
    team_b_id: string;
    predicted_winner_team_id: string;
}

export interface BlockStanding {
    teamId: string;
    teamName: string;
    correctCount: number;
    votesCast: number;
    isWinner: boolean;
    pointsAwarded: number;
}

export interface PredictionBlock {
    label: string;
    weeks: number[];
    totalAvailable: number;
    isComplete: boolean;
    standings: BlockStanding[];
}

interface UsePredictionsResult {
    loading: boolean;
    error: string | null;
    saving: boolean;
    getMyPrediction: (voterTeamId: string, week: number, teamAId: string, teamBId: string) => string | null;
    submitPrediction: (voterTeamId: string, deviceToken: string, week: number, teamAId: string, teamBId: string, predictedWinnerTeamId: string) => Promise<{ success: boolean; error?: string }>;
    blocks: PredictionBlock[];
}

export function usePredictions(teams: Team[], matchupsByWeek: Map<number, Matchup[]>): UsePredictionsResult {
    const [rows, setRows] = useState<PredictionRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [refetchToken, setRefetchToken] = useState(0);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            setLoading(true);
            const { data, error: fetchError } = await supabase
                .from('matchup_predictions')
                .select('week, voter_team_id, team_a_id, team_b_id, predicted_winner_team_id');

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

    const getMyPrediction = useCallback((voterTeamId: string, week: number, teamAId: string, teamBId: string): string | null => {
        const row = rows.find(r =>
            r.voter_team_id === voterTeamId &&
            r.week === week &&
            ((r.team_a_id === teamAId && r.team_b_id === teamBId) || (r.team_a_id === teamBId && r.team_b_id === teamAId))
        );
        return row?.predicted_winner_team_id ?? null;
    }, [rows]);

    const submitPrediction = useCallback(async (
        voterTeamId: string, deviceToken: string, week: number, teamAId: string, teamBId: string, predictedWinnerTeamId: string
    ) => {
        setSaving(true);
        const { data, error: fnError } = await supabase.functions.invoke('submit-prediction', {
            body: { teamId: voterTeamId, deviceToken, week, teamAId, teamBId, predictedWinnerTeamId }
        });
        setSaving(false);

        if (fnError || !data?.success) {
            return { success: false, error: data?.error || 'Could not save your prediction - try again.' };
        }
        setRefetchToken(t => t + 1);
        return { success: true };
    }, []);

    const blocks: PredictionBlock[] = BLOCKS.map(weeks => {
        const finalMatchups: Array<{ week: number; m: Matchup }> = [];
        for (const week of weeks) {
            for (const m of matchupsByWeek.get(week) ?? []) {
                if (m.isFinal) finalMatchups.push({ week, m });
            }
        }

        const totalAvailable = finalMatchups.length;
        const isComplete = weeks.every(week => {
            const weekMatchups = matchupsByWeek.get(week) ?? [];
            return weekMatchups.length > 0 && weekMatchups.every(m => m.isFinal);
        });

        const tally = new Map<string, { correctCount: number; votesCast: number }>();
        for (const { week, m } of finalMatchups) {
            for (const row of rows) {
                if (row.week !== week) continue;
                const matchesThisMatchup =
                    (row.team_a_id === m.teamA.teamId && row.team_b_id === m.teamB.teamId) ||
                    (row.team_a_id === m.teamB.teamId && row.team_b_id === m.teamA.teamId);
                if (!matchesThisMatchup) continue;

                const entry = tally.get(row.voter_team_id) ?? { correctCount: 0, votesCast: 0 };
                entry.votesCast += 1;
                if (m.winnerTeamIds.length === 1 && m.winnerTeamIds[0] === row.predicted_winner_team_id) {
                    entry.correctCount += 1;
                }
                tally.set(row.voter_team_id, entry);
            }
        }

        const qualified = [...tally.entries()].filter(([, v]) => v.votesCast >= totalAvailable / 2);
        const maxCorrect = qualified.length > 0 ? Math.max(...qualified.map(([, v]) => v.correctCount)) : 0;
        const winnerIds = qualified.filter(([, v]) => v.correctCount === maxCorrect && maxCorrect > 0).map(([id]) => id);
        const pointsEach = winnerIds.length > 0 ? POINTS_PER_BLOCK / winnerIds.length : 0;

        const standings: BlockStanding[] = qualified
            .map(([teamId, v]) => ({
                teamId,
                teamName: teams.find(t => t.id === teamId)?.display_name ?? 'Unknown',
                correctCount: v.correctCount,
                votesCast: v.votesCast,
                isWinner: winnerIds.includes(teamId),
                pointsAwarded: winnerIds.includes(teamId) ? pointsEach : 0
            }))
            .sort((a, b) => b.correctCount - a.correctCount);

        return {
            label: weeks.length > 1 ? `Weeks ${weeks[0]}-${weeks[weeks.length - 1]}` : `Week ${weeks[0]}`,
            weeks,
            totalAvailable,
            isComplete,
            standings
        };
    });

    return { loading, error, saving, getMyPrediction, submitPrediction, blocks };
}
