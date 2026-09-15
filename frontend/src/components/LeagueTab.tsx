import { useState } from 'react';
import { useLeagueScores } from '../hooks/useLeagueScores';
import { useBonusResults } from '../hooks/useBonusResults';
import { usePredictions } from '../hooks/usePredictions';
import { SeasonRankingsTable } from './SeasonRankingsTable';
import { WeeklyScoresTable } from './WeeklyScoresTable';
import { PillToggle } from './PillToggle';
import type { TeamWithDuos, AwardType } from '../types';

interface LeagueTabProps {
    teams: TeamWithDuos[];
    myTeamId?: string | null;
    duoNames?: Map<string, string>;
    /** Seeds which award tab this opens on - used by the #/league/<award>
     * deep link (see App.tsx) so the recap page's "View full standings"
     * link lands on whichever award the person was actually looking at
     * (Next Up, Season of Boom), not always Brown Bell regardless. */
    initialAward?: AwardType;
}

export function LeagueTab({ teams, myTeamId, duoNames, initialAward }: LeagueTabProps) {
    const { main, nextup, boom, loading, error } = useLeagueScores(teams);
    // The Brown Bell Award is decided by Main Award season points PLUS
    // accumulated bonus points combined - both the weekly matchup bonus AND
    // the prediction-poll block bonus feed into this same total, reusing
    // the same computations already shown on the Showdown tab, so there's
    // no risk of independent calculations disagreeing on the number that
    // actually determines who's winning.
    const { seasonRankings: bonusRankings, matchupsByWeek } = useBonusResults(teams);
    const { blocks: predictionBlocks } = usePredictions(teams.map(t => t.team), matchupsByWeek);
    const [award, setAward] = useState<AwardType>(() => initialAward ?? 'main');
    const [view, setView] = useState<'rankings' | 'weekly'>('rankings');

    if (loading) {
        return <p className="font-body text-sm text-chalk-dim">Loading league scores&hellip;</p>;
    }

    if (error) {
        return (
            <div className="rounded border border-brick/50 bg-brick/10 px-4 py-3">
                <p className="font-body text-sm text-chalk">Couldn&rsquo;t load scores: {error}</p>
            </div>
        );
    }

    const activeScores = award === 'main' ? main : award === 'boom' ? boom : nextup;
    if (!activeScores) return null;

    const matchupBonusTotals = new Map(bonusRankings.map(r => [r.teamId, r.totalBonus]));
    const predictionBonusTotals = new Map<string, number>();
    for (const block of predictionBlocks) {
        // Confirmed as a real reported issue: prediction points were being
        // summed as soon as any matchup within the block went final, so
        // a team's "Bonus" figure could fluctuate week to week within a
        // still-open 4-week block, then potentially change again before
        // the block actually closes. Prediction bonus is meant to settle
        // once, at the end of its full block - not appear and shift
        // week by week while votes are still being scored.
        if (!block.isComplete) continue;
        for (const standing of block.standings) {
            if (standing.pointsAwarded > 0) {
                predictionBonusTotals.set(standing.teamId, (predictionBonusTotals.get(standing.teamId) ?? 0) + standing.pointsAwarded);
            }
        }
    }

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <PillToggle
                    options={[{ id: 'main', label: 'Brown Bell' }, { id: 'nextup', label: 'Next Up' }, { id: 'boom', label: 'Season of Boom' }]}
                    value={award}
                    onChange={setAward}
                />
                <PillToggle
                    options={[{ id: 'rankings', label: 'Season' }, { id: 'weekly', label: 'Weekly' }]}
                    value={view}
                    onChange={setView}
                />
            </div>

            {view === 'rankings' ? (
                <SeasonRankingsTable
                    scores={activeScores}
                    myTeamId={myTeamId}
                    awardType={award}
                    duoNames={duoNames}
                    matchupBonusTotals={award === 'main' ? matchupBonusTotals : undefined}
                    predictionBonusTotals={award === 'main' ? predictionBonusTotals : undefined}
                />
            ) : (
                <WeeklyScoresTable scores={activeScores} myTeamId={myTeamId} awardType={award} duoNames={duoNames} teams={teams} />
            )}
        </div>
    );
}
