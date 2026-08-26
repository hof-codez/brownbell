import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { TeamWithDuos } from '../types';

interface TeamRef {
    teamId: string;
    teamName: string;
}

export interface RecapData {
    /** Whether this week has genuinely started - at least one bonus_results
     * row exists, which the automation only ever writes once real,
     * non-zero score data exists (see the matching server-side check).
     * When false, every category below is intentionally null/empty - there
     * is nothing genuine to report yet, not "nobody's ahead." */
    weekHasStarted: boolean;
    /** The lower-cumulative-total team beating the higher one - null if no
     * such result this week (including if every matchup went "as expected"). */
    upsetOfWeek: (TeamRef & { opponent: TeamRef; cumulativeGapBeaten: number }) | null;
    mostDominant: (TeamRef & { opponent: TeamRef; margin: number }) | null;
    /** Smallest margin among played matchups - can be a tie (margin 0). */
    closestCall: { teamA: TeamRef & { score: number }; teamB: TeamRef & { score: number }; margin: number } | null;
    /** Biggest week-over-week point drop. Null if this is week 1 (nothing to compare to). */
    mostDisappointing: (TeamRef & { swing: number }) | null;
    /** Biggest week-over-week point increase. Same week-1 caveat. */
    mostImproved: (TeamRef & { swing: number }) | null;
    nextUpSpotlight: (TeamRef & { points: number }) | null;
    /** Every team that lost its matchup while a Main Award player of theirs was on bye. */
    byeWeekCasualties: (TeamRef & { byedPlayerName: string })[];
}

export function useWeeklyRecap(teams: TeamWithDuos[], week: number) {
    const [recap, setRecap] = useState<RecapData | null>(null);
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
            const teamNameById: Record<string, string> = {};
            teams.forEach(t => { teamNameById[t.team.id] = t.team.display_name; });
            const ref = (teamId: string): TeamRef => ({ teamId, teamName: teamNameById[teamId] || 'Unknown' });

            const [scoresRes, bonusRes] = await Promise.all([
                supabase.from('weekly_scores')
                    .select('team_id, award_type, week, points, sleeper_player_id, player_name, was_bye')
                    .in('team_id', teamIds),
                supabase.from('bonus_results')
                    .select('team_id, week, opponent_team_id, team_score, opponent_score, outcome')
                    .in('team_id', teamIds)
                    .eq('week', week)
            ]);

            if (cancelled) return;
            if (scoresRes.error) { setError(scoresRes.error.message); setLoading(false); return; }
            if (bonusRes.error) { setError(bonusRes.error.message); setLoading(false); return; }

            const scoreRows = scoresRes.data ?? [];
            const bonusRows = bonusRes.data ?? [];

            // The automation only ever writes bonus_results once real,
            // non-zero score data exists for the week - so its mere
            // presence is a reliable "has this week actually started"
            // signal, without needing to re-derive that independently here
            // (and potentially disagreeing with the server-side check).
            const weekHasStarted = bonusRows.length > 0;

            if (!weekHasStarted) {
                if (!cancelled) {
                    setRecap({
                        weekHasStarted: false,
                        upsetOfWeek: null, mostDominant: null, closestCall: null,
                        mostDisappointing: null, mostImproved: null, nextUpSpotlight: null,
                        byeWeekCasualties: []
                    });
                    setLoading(false);
                }
                return;
            }

            const mainTotalsByTeamWeek = new Map<string, number>();
            for (const row of scoreRows) {
                if (row.award_type !== 'main') continue;
                const key = `${row.team_id}|${row.week}`;
                mainTotalsByTeamWeek.set(key, (mainTotalsByTeamWeek.get(key) || 0) + Number(row.points));
            }
            const cumulativeThroughWeek = (teamId: string, upToWeek: number): number => {
                let total = 0;
                for (let w = 1; w <= upToWeek; w++) total += mainTotalsByTeamWeek.get(`${teamId}|${w}`) || 0;
                return total;
            };

            const seenPairs = new Set<string>();
            let upsetOfWeek: RecapData['upsetOfWeek'] = null;
            let biggestUpsetGap = -Infinity;
            let mostDominant: RecapData['mostDominant'] = null;
            let biggestMargin = -Infinity;
            let closestCall: RecapData['closestCall'] = null;
            let smallestMargin = Infinity;

            for (const row of bonusRows) {
                if (!row.opponent_team_id || row.team_id >= row.opponent_team_id) continue;
                const key = `${row.team_id}|${row.opponent_team_id}`;
                if (seenPairs.has(key)) continue;
                seenPairs.add(key);

                const opp = bonusRows.find(r => r.team_id === row.opponent_team_id && r.week === week);
                if (!opp) continue;

                const teamScore = Number(row.team_score);
                const oppScore = Number(row.opponent_score);
                const margin = Math.abs(teamScore - oppScore);

                if (margin < smallestMargin) {
                    smallestMargin = margin;
                    closestCall = {
                        teamA: { ...ref(row.team_id), score: teamScore },
                        teamB: { ...ref(row.opponent_team_id), score: oppScore },
                        margin
                    };
                }

                if (row.outcome !== 'tie') {
                    const winnerId = row.outcome === 'win' ? row.team_id : row.opponent_team_id;
                    const loserId = row.outcome === 'win' ? row.opponent_team_id : row.team_id;

                    if (margin > biggestMargin) {
                        biggestMargin = margin;
                        mostDominant = { ...ref(winnerId), opponent: ref(loserId), margin };
                    }

                    const winnerCumThrough = cumulativeThroughWeek(winnerId, week);
                    const loserCumThrough = cumulativeThroughWeek(loserId, week);
                    if (winnerCumThrough < loserCumThrough) {
                        const gap = loserCumThrough - winnerCumThrough;
                        if (gap > biggestUpsetGap) {
                            biggestUpsetGap = gap;
                            upsetOfWeek = { ...ref(winnerId), opponent: ref(loserId), cumulativeGapBeaten: gap };
                        }
                    }
                }
            }

            let mostDisappointing: RecapData['mostDisappointing'] = null;
            let worstSwing = Infinity;
            let mostImproved: RecapData['mostImproved'] = null;
            let bestSwing = -Infinity;

            if (week > 1) {
                for (const teamId of teamIds) {
                    const thisWeek = mainTotalsByTeamWeek.get(`${teamId}|${week}`);
                    const lastWeek = mainTotalsByTeamWeek.get(`${teamId}|${week - 1}`);
                    if (thisWeek === undefined || lastWeek === undefined) continue;
                    const swing = thisWeek - lastWeek;
                    if (swing < worstSwing) { worstSwing = swing; mostDisappointing = { ...ref(teamId), swing }; }
                    if (swing > bestSwing) { bestSwing = swing; mostImproved = { ...ref(teamId), swing }; }
                }
            }

            const nextUpTotalsThisWeek = new Map<string, number>();
            for (const row of scoreRows) {
                if (row.award_type !== 'nextup' || row.week !== week) continue;
                nextUpTotalsThisWeek.set(row.team_id, (nextUpTotalsThisWeek.get(row.team_id) || 0) + Number(row.points));
            }
            let nextUpSpotlight: RecapData['nextUpSpotlight'] = null;
            let bestNextUp = -Infinity;
            for (const [teamId, points] of nextUpTotalsThisWeek) {
                if (points > bestNextUp) { bestNextUp = points; nextUpSpotlight = { ...ref(teamId), points }; }
            }

            const losingTeamIds = new Set(bonusRows.filter(r => r.outcome === 'loss').map(r => r.team_id));
            const byeWeekCasualties: RecapData['byeWeekCasualties'] = [];
            for (const teamId of losingTeamIds) {
                const byedRow = scoreRows.find(r =>
                    r.team_id === teamId && r.award_type === 'main' && r.week === week && r.was_bye
                );
                if (byedRow) byeWeekCasualties.push({ ...ref(teamId), byedPlayerName: byedRow.player_name || 'Unknown player' });
            }

            if (!cancelled) {
                setRecap({ weekHasStarted: true, upsetOfWeek, mostDominant, closestCall, mostDisappointing, mostImproved, nextUpSpotlight, byeWeekCasualties });
                setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [teams, week]);

    return { recap, loading, error };
}
