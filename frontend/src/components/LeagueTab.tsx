import { useState } from 'react';
import { useLeagueScores } from '../hooks/useLeagueScores';
import { useBonusResults } from '../hooks/useBonusResults';
import { SeasonRankingsTable } from './SeasonRankingsTable';
import { WeeklyScoresTable } from './WeeklyScoresTable';
import type { TeamWithDuos, AwardType } from '../types';

interface LeagueTabProps {
    teams: TeamWithDuos[];
    myTeamId?: string | null;
    duoNames?: Map<string, string>;
}

function PillToggle<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
    return (
        <div className="inline-flex rounded border border-panel-line p-0.5">
            {options.map(opt => (
                <button
                    key={opt.id}
                    onClick={() => onChange(opt.id)}
                    className={`rounded px-3 py-1 font-mono text-xs uppercase tracking-widest transition-colors ${
                        value === opt.id ? 'bg-bell text-field' : 'text-chalk-dim'
                    }`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

export function LeagueTab({ teams, myTeamId, duoNames }: LeagueTabProps) {
    const { main, nextup, loading, error } = useLeagueScores(teams);
    // The Brown Bell Award is decided by Main Award season points PLUS
    // accumulated bonus points combined - reusing the same bonus totals
    // already shown on the Showdown tab, so there's no risk of two
    // independent computations disagreeing on the number that actually
    // determines who's winning.
    const { seasonRankings: bonusRankings } = useBonusResults(teams);
    const [award, setAward] = useState<AwardType>('main');
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

    const activeScores = award === 'main' ? main : nextup;
    if (!activeScores) return null;

    const bonusTotals = new Map(bonusRankings.map(r => [r.teamId, r.totalBonus]));

    return (
        <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <PillToggle
                    options={[{ id: 'main', label: 'Main Award' }, { id: 'nextup', label: 'Next Up' }]}
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
                    bonusTotals={award === 'main' ? bonusTotals : undefined}
                />
            ) : (
                <WeeklyScoresTable scores={activeScores} myTeamId={myTeamId} awardType={award} duoNames={duoNames} teams={teams} />
            )}
        </div>
    );
}
