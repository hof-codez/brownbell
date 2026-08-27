import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { LIVE_SCORE_POLL_INTERVAL_MS } from '../lib/livePolling';
import type { TeamWithDuos, AwardType } from '../types';

export interface PlayerScore {
    sleeperPlayerId: string;
    playerName: string;
    playerPosition: string;
    points: number;
    /** Only meaningful in the weekly view - a single boolean doesn't make
     * sense for a season-long aggregate, so this is left undefined there. */
    wasBye?: boolean;
    /** Which duo slot (0 or 1) this player occupied that week - a
     * substitution can put a DIFFERENT player in the same slot across
     * different weeks, so this is what lets a grid align "row 1" / "row 2"
     * consistently across the season rather than by player identity. */
    playerIndex: 0 | 1;
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
    players: PlayerScore[]; // the team's CURRENT duo picks, each with their own season total so far (0 if none yet)
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

export function useLeagueScores(teams: TeamWithDuos[]): UseLeagueScoresResult {
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
            const teamIds = teams.map(t => t.team.id);
            const { data, error: fetchError } = await supabase
                .from('weekly_scores')
                .select('team_id, award_type, week, sleeper_player_id, points, player_name, player_position, was_bye, player_index')
                .in('team_id', teamIds);

            if (cancelled) return;

            if (fetchError) {
                setError(fetchError.message);
                setLoading(false);
                return;
            }

            const teamNameById: Record<string, string> = {};
            teams.forEach(t => { teamNameById[t.team.id] = t.team.display_name; });

            function buildAward(awardType: AwardType): AwardScores {
                const rows = (data ?? []).filter(r => r.award_type === awardType);

                // Team total per week = sum of the duo's 2 player rows, but we
                // also keep each individual player's row alongside it. Weekly
                // history is only ever built from actually-recorded scores -
                // there's nothing to show for a week that hasn't been played yet.
                const byTeamWeek = new Map<string, { total: number; players: PlayerScore[] }>();
                for (const row of rows) {
                    const key = `${row.team_id}|${row.week}`;
                    const entry = byTeamWeek.get(key) || { total: 0, players: [] };
                    entry.total += Number(row.points);
                    entry.players.push({
                        sleeperPlayerId: row.sleeper_player_id,
                        playerName: row.player_name || 'Unknown player',
                        playerPosition: row.player_position || '',
                        points: Number(row.points),
                        wasBye: !!row.was_bye,
                        playerIndex: row.player_index
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

                // Season total per team = full sum of every recorded row, no
                // matter who scored it - unaffected by any later swap.
                const seasonTotals = new Map<string, number>();
                for (const t of teams) seasonTotals.set(t.team.id, 0);
                for (const row of rows) {
                    seasonTotals.set(row.team_id, (seasonTotals.get(row.team_id) || 0) + Number(row.points));
                }

                // Per-player season total, keyed by team+player - used to look
                // up each CURRENT pick's own accumulated points below.
                const playerSeasonTotals = new Map<string, number>(); // `${teamId}|${sleeperPlayerId}` -> points
                for (const row of rows) {
                    const key = `${row.team_id}|${row.sleeper_player_id}`;
                    playerSeasonTotals.set(key, (playerSeasonTotals.get(key) || 0) + Number(row.points));
                }

                const seasonRankings: SeasonRanking[] = teams
                    .map(t => {
                        const slots = awardType === 'main' ? t.main : t.nextup;
                        const players: PlayerScore[] = slots
                            .filter((s): s is NonNullable<typeof s> => s !== null && !!s.sleeper_player_id)
                            .map(s => ({
                                sleeperPlayerId: s.sleeper_player_id!,
                                playerName: s.player_name,
                                playerPosition: s.player_position,
                                points: playerSeasonTotals.get(`${t.team.id}|${s.sleeper_player_id}`) || 0,
                                playerIndex: s.player_index
                            }));

                        return {
                            teamId: t.team.id,
                            teamName: teamNameById[t.team.id] || 'Unknown',
                            total: seasonTotals.get(t.team.id) || 0,
                            players
                        };
                    })
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
        // Poll while this tab is open - see LIVE_SCORE_POLL_INTERVAL_MS. load()
        // never flips loading back to true, so this updates silently in the
        // background with no flicker.
        const intervalId = setInterval(load, LIVE_SCORE_POLL_INTERVAL_MS);
        return () => { cancelled = true; clearInterval(intervalId); };
    }, [teams]);

    return { main, nextup, loading, error };
}
