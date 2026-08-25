import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { TeamWithDuos } from '../types';
import { getScheduledMatchupsForWeek, REGULAR_SEASON_WEEKS } from '../lib/bonusSchedule';

export interface MatchupPlayer {
    sleeperPlayerId: string;
    playerName: string;
    playerPosition: string;
    points: number;
}

export interface Matchup {
    week: number;
    played: boolean; // false = scheduled but no result recorded yet (still upcoming)
    teamA: { teamId: string; teamName: string; score: number; players: MatchupPlayer[] };
    teamB: { teamId: string; teamName: string; score: number; players: MatchupPlayer[] };
    winnerTeamIds: string[]; // empty if not played; 1 team normally, 2 on a tie
    tier: number | null;
    bonusPointsEach: number;
    /** The closest-scoring matchup that week between two teams who were BOTH
     * in the top half of the league by CUMULATIVE total THROUGH that week
     * specifically - not today's standings, so a past week's pick never
     * changes later as the season moves on. */
    isMatchupOfTheWeek: boolean;
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

export function useBonusResults(teamsWithDuos: TeamWithDuos[]): UseBonusResultsResult {
    const [matchupsByWeek, setMatchupsByWeek] = useState<Map<number, Matchup[]>>(new Map());
    const [seasonRankings, setSeasonRankings] = useState<SeasonBonusRanking[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (teamsWithDuos.length === 0) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        async function load() {
            const teams = teamsWithDuos.map(t => t.team);
            const teamIds = teams.map(t => t.id);

            const [bonusResultsRes, weeklyScoresRes] = await Promise.all([
                supabase.from('bonus_results')
                    .select('team_id, week, opponent_team_id, team_score, opponent_score, outcome, tier, bonus_points')
                    .in('team_id', teamIds),
                // Only Main Award scores are relevant here - bonus matchups are a
                // Main Award mechanic, Next Up never enters into this.
                supabase.from('weekly_scores')
                    .select('team_id, week, sleeper_player_id, points, player_name, player_position')
                    .eq('award_type', 'main')
                    .in('team_id', teamIds)
            ]);

            if (cancelled) return;

            if (bonusResultsRes.error) {
                setError(bonusResultsRes.error.message);
                setLoading(false);
                return;
            }
            if (weeklyScoresRes.error) {
                setError(weeklyScoresRes.error.message);
                setLoading(false);
                return;
            }

            const teamNameById: Record<string, string> = {};
            const currentMainDuoByTeamId: Record<string, MatchupPlayer[]> = {};
            teamsWithDuos.forEach(t => {
                teamNameById[t.team.id] = t.team.display_name;
                currentMainDuoByTeamId[t.team.id] = t.main
                    .filter((s): s is NonNullable<typeof s> => s !== null && !!s.sleeper_player_id)
                    .map(s => ({
                        sleeperPlayerId: s.sleeper_player_id!,
                        playerName: s.player_name,
                        playerPosition: s.player_position,
                        points: 0
                    }));
            });

            const rows = bonusResultsRes.data ?? [];
            const scoreRows = weeklyScoresRes.data ?? [];

            const resultByWeekAndTeam = new Map<string, typeof rows[number]>();
            for (const row of rows) {
                resultByWeekAndTeam.set(`${row.week}|${row.team_id}`, row);
            }

            // Real Main Award players who actually scored that week - captured
            // at write time, so this stays accurate even after a later swap.
            const playersByWeekAndTeam = new Map<string, MatchupPlayer[]>();
            for (const row of scoreRows) {
                const key = `${row.week}|${row.team_id}`;
                const list = playersByWeekAndTeam.get(key) || [];
                list.push({
                    sleeperPlayerId: row.sleeper_player_id,
                    playerName: row.player_name || 'Unknown player',
                    playerPosition: row.player_position || '',
                    points: Number(row.points)
                });
                playersByWeekAndTeam.set(key, list);
            }

            // Every scheduled week, 1 through the regular season's end - not
            // just played weeks. Unplayed weeks show the CURRENT duo picks
            // (no scores yet) instead of nothing.
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
                            teamA: { teamId: teamIdA, teamName: teamNameById[teamIdA] || 'Unknown', score: 0, players: currentMainDuoByTeamId[teamIdA] || [] },
                            teamB: { teamId: teamIdB, teamName: teamNameById[teamIdB] || 'Unknown', score: 0, players: currentMainDuoByTeamId[teamIdB] || [] },
                            winnerTeamIds: [],
                            tier: null,
                            bonusPointsEach: 0,
                            isMatchupOfTheWeek: false
                        };
                    }

                    const winnerTeamIds = rowA.outcome === 'tie'
                        ? [teamIdA, teamIdB]
                        : (rowA.outcome === 'win' ? [teamIdA] : [teamIdB]);

                    return {
                        week,
                        played: true,
                        teamA: { teamId: teamIdA, teamName: teamNameById[teamIdA] || 'Unknown', score: Number(rowA.team_score), players: playersByWeekAndTeam.get(`${week}|${teamIdA}`) || [] },
                        teamB: { teamId: teamIdB, teamName: teamNameById[teamIdB] || 'Unknown', score: Number(rowB.team_score), players: playersByWeekAndTeam.get(`${week}|${teamIdB}`) || [] },
                        winnerTeamIds,
                        tier: rowA.outcome === 'loss' ? rowB.tier : rowA.tier,
                        bonusPointsEach: rowA.outcome === 'loss' ? Number(rowB.bonus_points) : Number(rowA.bonus_points),
                        isMatchupOfTheWeek: false
                    };
                });
                byWeek.set(week, weekMatchups);
            }

            // Matchup of the Week: for each week independently, find the
            // closest-scoring PLAYED matchup between two teams who were BOTH
            // in the top half of the league by their CUMULATIVE Main Award
            // total THROUGH that week - not current standings, so a past
            // week's pick stays accurate no matter how the season moves after.
            const cumulativeThroughWeek = (teamId: string, week: number): number =>
                scoreRows
                    .filter(r => r.team_id === teamId && r.week <= week)
                    .reduce((sum, r) => sum + Number(r.points), 0);

            const halfCount = Math.floor(teams.length / 2);
            for (let week = 1; week <= REGULAR_SEASON_WEEKS; week++) {
                const totalsThisWeek = teams
                    .map(t => ({ teamId: t.id, total: cumulativeThroughWeek(t.id, week) }))
                    .sort((a, b) => b.total - a.total);
                const topHalfIds = new Set(totalsThisWeek.slice(0, halfCount).map(t => t.teamId));

                const weekMatchups = byWeek.get(week) || [];
                const candidates = weekMatchups.filter(m =>
                    m.played && topHalfIds.has(m.teamA.teamId) && topHalfIds.has(m.teamB.teamId)
                );
                if (candidates.length === 0) continue;

                const closest = candidates.reduce((best, m) => {
                    const gap = Math.abs(m.teamA.score - m.teamB.score);
                    const bestGap = Math.abs(best.teamA.score - best.teamB.score);
                    return gap < bestGap ? m : best;
                });
                closest.isMatchupOfTheWeek = true;
            }

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
    }, [teamsWithDuos]);

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
