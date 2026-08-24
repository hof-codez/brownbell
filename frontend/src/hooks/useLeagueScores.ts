import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Team, AwardType } from '../types';

export interface PlayerScore {
    sleeperPlayerId: string;
    playerName: string;
    playerPosition: string;
    points: number;
}

interface WeeklyTeamScore {
    week: number;
    teamId: string;
    teamName: string;
    points: number;
    players: PlayerScore[];
}

interface SeasonRanking {
    rank: number;
    teamId: string;
    teamName: string;
    total: number;
    players: PlayerScore[]; // each player's SEASON total, not a single week
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
                .select('team_id, award_type, week, sleeper_player_id, points, player_name, player_position')
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
                const rows = (data ?? []).filter(r => r.award_type === awardType);

                // Team total per week = sum of the duo's 2 player rows, but we
                // also keep each individual player's row alongside it.
                const byTeamWeek = new Map<string, { total: number; players: PlayerScore[] }>();
                for (const row of rows) {
                    const key = `${row.team_id}|${row.week}`;
                    const entry = byTeamWeek.get(key) || { total: 0, players: [] };
                    entry.total += Number(row.points);
                    entry.players.push({
                        sleeperPlayerId: row.sleeper_player_id,
                        playerName: row.player_name || 'Unknown player',
                        playerPosition: row.player_position || '',
                        points: Number(row.points)
                    });
                    byTeamWeek.set(key, entry);
                }

                const weeksSet = new Set<number>();
                const weekly: WeeklyTeamScore[] = [];
                for (const [key, entry] of byTeamWeek) {
                    const [teamId, weekStr] = key.split('|');
                    const week = Number(weekStr);
                    weeksSet.add(week);
                    weekly.push({ week, teamId, teamName: teamNameById[teamId] || 'Unknown', points: entry.total, players: entry.players });
                }

                // Season totals: sum per team, AND sum per individual player
                // (a player's season total across every week they scored).
                const seasonTotals = new Map<string, number>();
                const playerSeasonTotals = new Map<string, Map<string, PlayerScore>>(); // teamId -> sleeperPlayerId -> accumulating score
                for (const t of teams) {
                    seasonTotals.set(t.id, 0);
                    playerSeasonTotals.set(t.id, new Map());
                }

                for (const row of rows) {
                    seasonTotals.set(row.team_id, (seasonTotals.get(row.team_id) || 0) + Number(row.points));

                    const teamPlayers = playerSeasonTotals.get(row.team_id) || new Map();
                    const existing = teamPlayers.get(row.sleeper_player_id);
                    if (existing) {
                        existing.points += Number(row.points);
                    } else {
                        teamPlayers.set(row.sleeper_player_id, {
                            sleeperPlayerId: row.sleeper_player_id,
                            playerName: row.player_name || 'Unknown player',
                            playerPosition: row.player_position || '',
                            points: Number(row.points)
                        });
                    }
                    playerSeasonTotals.set(row.team_id, teamPlayers);
                }

                const seasonRankings: SeasonRanking[] = [...seasonTotals.entries()]
                    .map(([teamId, total]) => ({
                        teamId,
                        teamName: teamNameById[teamId] || 'Unknown',
                        total,
                        players: [...(playerSeasonTotals.get(teamId)?.values() ?? [])]
                    }))
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
