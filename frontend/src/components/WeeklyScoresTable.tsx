import { useState, useEffect } from 'react';
import type { AwardScores } from '../hooks/useLeagueScores';

interface WeeklyScoresTableProps {
    scores: AwardScores;
    myTeamId?: string | null;
}

export function WeeklyScoresTable({ scores, myTeamId }: WeeklyScoresTableProps) {
    const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

    // Default to the most recent week once data loads
    useEffect(() => {
        if (selectedWeek === null && scores.weeksAvailable.length > 0) {
            setSelectedWeek(scores.weeksAvailable[scores.weeksAvailable.length - 1]);
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
            <label htmlFor="week-select" className="sr-only">Select week</label>
            <select
                id="week-select"
                value={selectedWeek ?? ''}
                onChange={(e) => setSelectedWeek(Number(e.target.value))}
                className="mb-3 rounded border border-panel-line bg-field px-3 py-1.5 font-mono text-sm text-chalk"
            >
                {scores.weeksAvailable.map(w => (
                    <option key={w} value={w}>Week {w}</option>
                ))}
            </select>

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
                        {weekRows.map((row, i) => (
                            <tr
                                key={row.teamId}
                                className={`border-b border-panel-line last:border-0 ${row.teamId === myTeamId ? 'bg-bell/10' : ''}`}
                            >
                                <td className="px-3 py-2 font-mono text-sm text-chalk-dim">{i + 1}</td>
                                <td className="px-3 py-2 font-body text-sm text-chalk">
                                    {row.teamName}
                                    {row.teamId === myTeamId && <span className="ml-1.5 text-xs text-bell">(You)</span>}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-sm font-semibold text-chalk">
                                    {row.points.toFixed(1)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
