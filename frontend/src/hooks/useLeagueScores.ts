import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Team, AwardType } from '../types';

interface WeeklyTeamScore {
    week: number;
    teamId: string;
    teamName: string;
    points: number;
}

interface SeasonRanking {
    rank: number;
    teamId: string;
    teamName: string;
    total: number;
}

export interface AwardScores {
    weekly: WeeklyTeamScore[];
    seasonRankings: SeasonRanking[];
    weeksAvailable: number[];
}

interface UseLeagueScoresResult {
    main: AwardScores | null;
    nextup: AwardScores | null;
    loading: boolean;
    error: string | null;
}

export function useLeagueScores(teams: Team[]): UseLeagueScoresResult {
    const [main, setMain] = useState<AwardScores | null>(null);
    const [nextup, setNextup] = useState<AwardScores | null>(null);
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
                .from('weekly_scores')
                .select('team_id, award_type, week, points')
                .in('team_id', teamIds);

            if (cancelled) return;

            if (fetchError) {
                setError(fetchError.message);
                setLoading(false);
                return;
            }

            const teamNameById: Record<string, string> = {};
            teams.forEach(t => { teamNameById[t.id] = t.display_name; });

            function buildAward(awardType: AwardType): AwardScores {
                // weekly_scores has one row per player - sum the duo's 2 rows
                // into a single team total per week.
                const byTeamWeek = new Map<string, number>();
                for (const row of (data ?? []).filter(r => r.award_type === awardType)) {
                    const key = `${row.team_id}|${row.week}`;
                    byTeamWeek.set(key, (byTeamWeek.get(key) || 0) + Number(row.points));
                }

                const weeksSet = new Set<number>();
                const weekly: WeeklyTeamScore[] = [];
                for (const [key, points] of byTeamWeek) {
                    const [teamId, weekStr] = key.split('|');
                    const week = Number(weekStr);
                    weeksSet.add(week);
                    weekly.push({ week, teamId, teamName: teamNameById[teamId] || 'Unknown', points });
                }

                // Every team appears in the ranking, even at 0 - makes it clear
                // who hasn't scored (or hasn't set a duo) yet, not just omitted.
                const seasonTotals = new Map<string, number>();
                for (const t of teams) seasonTotals.set(t.id, 0);
                for (const w of weekly) {
                    seasonTotals.set(w.teamId, (seasonTotals.get(w.teamId) || 0) + w.points);
                }

                const seasonRankings: SeasonRanking[] = [...seasonTotals.entries()]
                    .map(([teamId, total]) => ({ teamId, teamName: teamNameById[teamId] || 'Unknown', total }))
                    .sort((a, b) => b.total - a.total)
                    .map((t, i) => ({ ...t, rank: i + 1 }));

                return {
                    weekly,
                    seasonRankings,
                    weeksAvailable: [...weeksSet].sort((a, b) => a - b)
                };
            }

            if (!cancelled) {
                setMain(buildAward('main'));
                setNextup(buildAward('nextup'));
                setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [teams]);

    return { main, nextup, loading, error };
}
