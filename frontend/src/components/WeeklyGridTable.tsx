import { useEffect, useRef } from 'react';
import type { AwardScores } from '../hooks/useLeagueScores';
import type { AwardType } from '../types';
import { duoNameKey } from '../hooks/useDuoNames';
import { pickDefaultWeek } from '../lib/displayWeek';

interface WeeklyGridTableProps {
    scores: AwardScores;
    myTeamId?: string | null;
    awardType: AwardType;
    duoNames?: Map<string, string>;
}

interface CellData {
    points: number;
    wasBye: boolean;
}

// Combined weekly view - every team's score for every week in one table,
// scrollable sideways to see more weeks. Two rows per team, one per duo
// slot - aligned by SLOT (0/1), not by player identity, so a mid-season
// substitution doesn't break the row's continuity: the row simply shows
// whoever occupied that slot in each given week. The team-name and Total
// columns are pinned on the left and span both of a team's rows.
export function WeeklyGridTable({ scores, myTeamId, awardType, duoNames }: WeeklyGridTableProps) {
    const targetWeekRef = useRef<HTMLTableCellElement | null>(null);
    const targetWeek = pickDefaultWeek(scores.weeksAvailable);

    // Bring the relevant week's column into view by default, same delayed
    // logic as the single-week dropdown (see lib/displayWeek.ts) - without
    // this, a season with many weeks would just show the earliest ones
    // first, requiring a manual scroll to see anything recent.
    useEffect(() => {
        targetWeekRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
    }, [targetWeek]);

    if (scores.weeksAvailable.length === 0) {
        return (
            <div className="rounded border border-dashed border-panel-line px-4 py-6 text-center">
                <p className="font-body text-sm text-chalk-dim">No scores recorded yet.</p>
            </div>
        );
    }

    const cellByTeamSlotWeek = new Map<string, CellData>();
    for (const w of scores.weekly) {
        for (const p of w.players) {
            cellByTeamSlotWeek.set(`${w.teamId}|${p.playerIndex}|${w.week}`, { points: p.points, wasBye: !!p.wasBye });
        }
    }

    return (
        <div className="overflow-x-auto rounded-lg border border-panel-line">
            <table className="border-collapse">
                <thead>
                    <tr className="border-b border-panel-line">
                        <th className="sticky left-0 z-10 w-36 truncate bg-panel px-3 py-2 text-left font-mono text-xs uppercase tracking-widest text-chalk-dim">
                            Team
                        </th>
                        <th className="sticky left-36 z-10 w-32 truncate bg-panel px-3 py-2 text-left font-mono text-xs uppercase tracking-widest text-chalk-dim">
                            Player
                        </th>
                        {scores.weeksAvailable.map(w => (
                            <th
                                key={w}
                                ref={w === targetWeek ? targetWeekRef : undefined}
                                className="min-w-[4.5rem] whitespace-nowrap bg-panel px-3 py-2 text-right font-mono text-xs uppercase tracking-widest text-chalk-dim"
                            >
                                Wk {w}
                            </th>
                        ))}
                        <th className="sticky right-0 z-10 min-w-[4.5rem] whitespace-nowrap bg-panel px-3 py-2 text-right font-mono text-xs uppercase tracking-widest text-chalk-dim">
                            Total
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {scores.seasonRankings.map(row => {
                        const name = duoNames?.get(duoNameKey(row.teamId, awardType));
                        const isMe = row.teamId === myTeamId;
                        const rowBg = isMe ? 'bg-bell/10' : 'bg-field';
                        const slot0 = row.players.find(p => p.playerIndex === 0);
                        const slot1 = row.players.find(p => p.playerIndex === 1);
                        const slotRows: Array<{ index: 0 | 1; label: string }> = [
                            { index: 0, label: slot0 ? `${slot0.playerName} (${slot0.playerPosition})` : '\u2013' },
                            { index: 1, label: slot1 ? `${slot1.playerName} (${slot1.playerPosition})` : '\u2013' }
                        ];

                        return slotRows.map((slotRow, i) => (
                            <tr key={`${row.teamId}-${slotRow.index}`} className={`border-b border-panel-line last:border-0 ${rowBg}`}>
                                {i === 0 && (
                                    <td
                                        rowSpan={2}
                                        title={`${row.teamName}${name ? ` "${name}"` : ''}`}
                                        className={`sticky left-0 z-10 w-36 truncate align-top px-3 py-2 font-body text-sm text-chalk ${rowBg}`}
                                    >
                                        {row.teamName}
                                        {name && <span className="ml-1 text-xs italic text-chalk-dim">&ldquo;{name}&rdquo;</span>}
                                        {isMe && <span className="ml-1 text-xs text-bell">(You)</span>}
                                    </td>
                                )}
                                <td title={slotRow.label} className={`sticky left-36 z-10 w-32 truncate px-3 py-2 font-mono text-xs text-chalk-dim ${rowBg}`}>
                                    {slotRow.label}
                                </td>
                                {scores.weeksAvailable.map(w => {
                                    const cell = cellByTeamSlotWeek.get(`${row.teamId}|${slotRow.index}|${w}`);
                                    return (
                                        <td key={w} className="whitespace-nowrap px-3 py-2 text-right font-mono text-sm text-chalk">
                                            {cell
                                                ? (cell.wasBye
                                                    ? <span className="text-brick">BYE</span>
                                                    : cell.points.toFixed(1))
                                                : '\u2013'}
                                        </td>
                                    );
                                })}
                                {i === 0 && (
                                    <td rowSpan={2} className={`sticky right-0 z-10 align-middle whitespace-nowrap px-3 py-2 text-right font-mono text-sm font-semibold text-chalk ${rowBg}`}>
                                        {row.total.toFixed(1)}
                                    </td>
                                )}
                            </tr>
                        ));
                    })}
                </tbody>
            </table>
        </div>
    );
}
