import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Team } from '../types';

export interface Matchup {
    week: number;
    teamA: { teamId: string; teamName: string; score: number };
    teamB: { teamId: string; teamName: string; score: number };
    outcome: 'win' | 'loss' | 'tie'; // from teamA's perspective isn't meaningful here - see winnerTeamIds
    winnerTeamIds: string[]; // 1 team normally, 2 on a tie
    tier: number | null;
    bonusPointsEach: number; // what each winner (or each tied team) actually receives
}

interface SeasonBonusRanking {
    rank: number;
    teamId: string;
    teamName: string;
    totalBonus: number;
    wins: number;
    losses: number;
    ties: number;
}

interface UseBonusResultsResult {
    matchupsByWeek: Map<number, Matchup[]>;
    weeksAvailable: number[];
    seasonRankings: SeasonBonusRanking[];
    loading: boolean;
    error: string | null;
}

export function useBonusResults(teams: Team[]): UseBonusResultsResult {
    const [matchupsByWeek, setMatchupsByWeek] = useState<Map<number, Matchup[]>>(new Map());
    const [weeksAvailable, setWeeksAvailable] = useState<number[]>([]);
    const [seasonRankings, setSeasonRankings] = useState<SeasonBonusRanking[]>([]);
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
                .from('bonus_results')
                .select('team_id, week, opponent_team_id, team_score, opponent_score, outcome, tier, bonus_points')
                .in('team_id', teamIds);

            if (cancelled) return;

            if (fetchError) {
                setError(fetchError.message);
                setLoading(false);
                return;
            }

            const teamNameById: Record<string, string> = {};
            teams.forEach(t => { teamNameById[t.id] = t.display_name; });

            const rows = data ?? [];

            // Each matchup produces 2 rows (one per side) - keep only the row
            // where team_id < opponent_team_id to show each matchup exactly once.
            const byWeek = new Map<number, Matchup[]>();
            const weeksSet = new Set<number>();

            for (const row of rows) {
                if (!row.opponent_team_id || row.team_id >= row.opponent_team_id) continue;
                weeksSet.add(row.week);

                const opponentRow = rows.find(r => r.team_id === row.opponent_team_id && r.week === row.week);
                if (!opponentRow) continue; // shouldn't happen, but don't crash if the paired row is missing

                const winnerTeamIds = row.outcome === 'tie'
                    ? [row.team_id, row.opponent_team_id]
                    : (row.outcome === 'win' ? [row.team_id] : [row.opponent_team_id]);

                const matchup: Matchup = {
                    week: row.week,
                    teamA: { teamId: row.team_id, teamName: teamNameById[row.team_id] || 'Unknown', score: Number(row.team_score) },
                    teamB: { teamId: row.opponent_team_id, teamName: teamNameById[row.opponent_team_id] || 'Unknown', score: Number(row.opponent_score) },
                    outcome: row.outcome,
                    winnerTeamIds,
                    tier: row.tier,
                    bonusPointsEach: row.outcome === 'loss' ? Number(opponentRow.bonus_points) : Number(row.bonus_points)
                };

                const list = byWeek.get(row.week) || [];
                list.push(matchup);
                byWeek.set(row.week, list);
            }

            for (const list of byWeek.values()) {
                list.sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99));
            }

            // Season bonus leaderboard - sum of bonus_points per team, plus a W-L-T record
            const bonusTotals = new Map<string, number>();
            const records = new Map<string, { wins: number; losses: number; ties: number }>();
            for (const t of teams) {
                bonusTotals.set(t.id, 0);
                records.set(t.id, { wins: 0, losses: 0, ties: 0 });
            }
            for (const row of rows) {
                bonusTotals.set(row.team_id, (bonusTotals.get(row.team_id) || 0) + Number(row.bonus_points));
                const rec = records.get(row.team_id) || { wins: 0, losses: 0, ties: 0 };
                if (row.outcome === 'win') rec.wins++;
                else if (row.outcome === 'loss') rec.losses++;
                else rec.ties++;
                records.set(row.team_id, rec);
            }

            const rankings: SeasonBonusRanking[] = [...bonusTotals.entries()]
                .map(([teamId, totalBonus]) => ({
                    teamId,
                    teamName: teamNameById[teamId] || 'Unknown',
                    totalBonus,
                    ...(records.get(teamId) || { wins: 0, losses: 0, ties: 0 })
                }))
                .sort((a, b) => b.totalBonus - a.totalBonus)
                .map((r, i) => ({ ...r, rank: i + 1 }));

            if (!cancelled) {
                setMatchupsByWeek(byWeek);
                setWeeksAvailable([...weeksSet].sort((a, b) => a - b));
                setSeasonRankings(rankings);
                setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [teams]);

    return { matchupsByWeek, weeksAvailable, seasonRankings, loading, error };
}
