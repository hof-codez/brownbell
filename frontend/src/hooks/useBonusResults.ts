import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Team } from '../types';
import { getScheduledMatchupsForWeek, REGULAR_SEASON_WEEKS } from '../lib/bonusSchedule';

export interface Matchup {
    week: number;
    played: boolean; // false = scheduled but no result recorded yet (still upcoming)
    teamA: { teamId: string; teamName: string; score: number };
    teamB: { teamId: string; teamName: string; score: number };
    winnerTeamIds: string[]; // empty if not played; 1 team normally, 2 on a tie
    tier: number | null;
    bonusPointsEach: number;
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

interface HeadToHeadRecord {
    wins: number;
    losses: number;
    ties: number;
}

interface UseBonusResultsResult {
    matchupsByWeek: Map<number, Matchup[]>;
    weeksAvailable: number[]; // every scheduled week 1..REGULAR_SEASON_WEEKS, not just played ones
    seasonRankings: SeasonBonusRanking[];
    loading: boolean;
    error: string | null;
    /** Cumulative record between two teams across every played matchup so far this season. */
    getHeadToHead: (teamIdA: string, teamIdB: string) => HeadToHeadRecord;
    /** This team's next unplayed scheduled matchup, if any. */
    getUpcomingMatchup: (teamId: string) => Matchup | null;
}

export function useBonusResults(teams: Team[]): UseBonusResultsResult {
    const [matchupsByWeek, setMatchupsByWeek] = useState<Map<number, Matchup[]>>(new Map());
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
            // Quick lookup: for a given week+team, find their recorded result (if played).
            const resultByWeekAndTeam = new Map<string, typeof rows[number]>();
            for (const row of rows) {
                resultByWeekAndTeam.set(`${row.week}|${row.team_id}`, row);
            }

            // Build every scheduled week, 1 through the end of the regular
            // season - not just weeks that have been played. Unplayed weeks
            // show the matchup with played=false and no scores yet.
            const byWeek = new Map<number, Matchup[]>();
            for (let week = 1; week <= REGULAR_SEASON_WEEKS; week++) {
                const scheduled = getScheduledMatchupsForWeek(teams, week);
                const weekMatchups: Matchup[] = scheduled.map(([teamIdA, teamIdB]) => {
                    const rowA = resultByWeekAndTeam.get(`${week}|${teamIdA}`);
                    const rowB = resultByWeekAndTeam.get(`${week}|${teamIdB}`);

                    if (!rowA || !rowB) {
                        return {
                            week,
                            played: false,
                            teamA: { teamId: teamIdA, teamName: teamNameById[teamIdA] || 'Unknown', score: 0 },
                            teamB: { teamId: teamIdB, teamName: teamNameById[teamIdB] || 'Unknown', score: 0 },
                            winnerTeamIds: [],
                            tier: null,
                            bonusPointsEach: 0
                        };
                    }

                    const winnerTeamIds = rowA.outcome === 'tie'
                        ? [teamIdA, teamIdB]
                        : (rowA.outcome === 'win' ? [teamIdA] : [teamIdB]);

                    return {
                        week,
                        played: true,
                        teamA: { teamId: teamIdA, teamName: teamNameById[teamIdA] || 'Unknown', score: Number(rowA.team_score) },
                        teamB: { teamId: teamIdB, teamName: teamNameById[teamIdB] || 'Unknown', score: Number(rowB.team_score) },
                        winnerTeamIds,
                        tier: rowA.outcome === 'loss' ? rowB.tier : rowA.tier,
                        bonusPointsEach: rowA.outcome === 'loss' ? Number(rowB.bonus_points) : Number(rowA.bonus_points)
                    };
                });
                byWeek.set(week, weekMatchups);
            }

            // Season bonus leaderboard - only counts PLAYED results.
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
                setSeasonRankings(rankings);
                setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [teams]);

    function getHeadToHead(teamIdA: string, teamIdB: string): HeadToHeadRecord {
        let wins = 0, losses = 0, ties = 0;
        for (const matchups of matchupsByWeek.values()) {
            for (const m of matchups) {
                if (!m.played) continue;
                const involvesBoth = (m.teamA.teamId === teamIdA && m.teamB.teamId === teamIdB) ||
                    (m.teamA.teamId === teamIdB && m.teamB.teamId === teamIdA);
                if (!involvesBoth) continue;

                if (m.winnerTeamIds.length === 2) ties++;
                else if (m.winnerTeamIds[0] === teamIdA) wins++;
                else losses++;
            }
        }
        return { wins, losses, ties };
    }

    function getUpcomingMatchup(teamId: string): Matchup | null {
        for (let week = 1; week <= REGULAR_SEASON_WEEKS; week++) {
            const matchups = matchupsByWeek.get(week) || [];
            const mine = matchups.find(m => m.teamA.teamId === teamId || m.teamB.teamId === teamId);
            if (mine && !mine.played) return mine;
        }
        return null;
    }

    const weeksAvailable = Array.from({ length: REGULAR_SEASON_WEEKS }, (_, i) => i + 1);

    return { matchupsByWeek, weeksAvailable, seasonRankings, loading, error, getHeadToHead, getUpcomingMatchup };
}
