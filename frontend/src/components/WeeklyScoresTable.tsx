import { useState, useEffect } from 'react';
import type { AwardScores } from '../hooks/useLeagueScores';
import type { AwardType, TeamWithDuos } from '../types';
import { duoNameKey } from '../hooks/useDuoNames';
import { WeeklyGridTable } from './WeeklyGridTable';
import { useSubstitutionBadges } from '../hooks/useSubstitutionBadges';
import type { SubstitutionBadge } from '../hooks/useSubstitutionBadges';
import { pickDefaultWeek } from '../lib/displayWeek';

interface WeeklyScoresTableProps {
    scores: AwardScores;
    myTeamId?: string | null;
    awardType: AwardType;
    duoNames?: Map<string, string>;
    teams: TeamWithDuos[];
}

const SUB_BADGE_STYLES: Record<SubstitutionBadge, string> = {
    'SUB': 'bg-bell/20 text-bell',
    'AUTO-SUB': 'bg-panel-line text-chalk-dim',
    'TRADE-SUB': 'bg-brick/20 text-brick'
};

export function WeeklyScoresTable({ scores, myTeamId, awardType, duoNames, teams }: WeeklyScoresTableProps) {
    const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
    const [mode, setMode] = useState<'single' | 'grid'>('single');
    const { getBadge } = useSubstitutionBadges(teams);

    useEffect(() => {
        if (selectedWeek === null && scores.weeksAvailable.length > 0) {
            setSelectedWeek(pickDefaultWeek(scores.weeksAvailable));
        }
    }, [scores.weeksAvailable, selectedWeek]);

    if (scores.weeksAvailable.length === 0) {
        return (
            <div className="rounded border border-dashed border-panel-line px-4 py-6 text-center">
                <p className="font-body text-sm text-chalk-dim">No scores recorded yet.</p>
            </div>
        );
    }

    const weekRows = scores.weekly
        .filter(w => w.week === selectedWeek)
        .sort((a, b) => b.points - a.points);

    return (
        <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
                {mode === 'single' && (
                    <>
                        <label htmlFor="week-select" className="sr-only">Select week</label>
                        <select
                            id="week-select"
                            value={selectedWeek ?? ''}
                            onChange={(e) => setSelectedWeek(Number(e.target.value))}
                            className="rounded border border-panel-line bg-field px-3 py-1.5 font-mono text-sm text-chalk"
                        >
                            {scores.weeksAvailable.map(w => (
                                <option key={w} value={w}>Week {w}</option>
                            ))}
                        </select>
                    </>
                )}
                <div className="inline-flex rounded border border-panel-line p-0.5">
                    {([{ id: 'single', label: 'Single Week' }, { id: 'grid', label: 'All Weeks' }] as const).map(opt => (
                        <button
                            key={opt.id}
                            onClick={() => setMode(opt.id)}
                            className={`rounded px-3 py-1 font-mono text-xs uppercase tracking-widest transition-colors ${
                                mode === opt.id ? 'bg-bell text-field' : 'text-chalk-dim'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {mode === 'grid' ? (
                <WeeklyGridTable scores={scores} myTeamId={myTeamId} awardType={awardType} duoNames={duoNames} />
            ) : (
                <div className="overflow-hidden rounded-lg border border-panel-line">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-panel-line bg-panel">
                                <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-widest text-chalk-dim">#</th>
                                <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-widest text-chalk-dim">Team</th>
                                <th className="px-3 py-2 text-right font-mono text-xs uppercase tracking-widest text-chalk-dim">Points</th>
                            </tr>
                        </thead>
                        <tbody>
                            {weekRows.map((row, i) => {
                                const name = duoNames?.get(duoNameKey(row.teamId, awardType));
                                return (
                                    <tr
                                        key={row.teamId}
                                        className={`border-b border-panel-line last:border-0 ${row.teamId === myTeamId ? 'bg-bell/10' : ''}`}
                                    >
                                        <td className="px-3 py-2 align-top font-mono text-sm text-chalk-dim">{i + 1}</td>
                                        <td className="px-3 py-2 align-top font-body text-sm text-chalk">
                                            <div>
                                                {row.teamName}
                                                {name && <span className="ml-1.5 text-xs italic text-chalk-dim">&ldquo;{name}&rdquo;</span>}
                                                {row.teamId === myTeamId && <span className="ml-1.5 text-xs text-bell">(You)</span>}
                                            </div>
                                            {row.players.length > 0 && (
                                                <div className="mt-0.5 font-mono text-xs text-chalk-dim">
                                                    {row.players.map((p, pi) => {
                                                        const badge = getBadge(row.teamId, awardType, p.playerIndex, row.week, p.sleeperPlayerId);
                                                        return (
                                                            <span key={p.sleeperPlayerId}>
                                                                {pi > 0 && ' \u00b7 '}
                                                                {p.playerName} ({p.playerPosition}) {p.points.toFixed(1)}
                                                                {badge && (
                                                                    <span className={`ml-1 rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SUB_BADGE_STYLES[badge]}`}>
                                                                        {badge}
                                                                    </span>
                                                                )}
                                                                {p.wasBye && (
                                                                    <span className="ml-1 rounded bg-brick/20 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brick">
                                                                        Bye
                                                                    </span>
                                                                )}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-right align-top font-mono text-sm font-semibold text-chalk">
                                            {row.points.toFixed(1)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
