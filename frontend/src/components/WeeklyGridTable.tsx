import { useState, useEffect, useRef } from 'react';
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

const TEAM_COL_WIDTH = 'w-40'; // 10rem - wide enough for the team name and, when expanded, an indented player name/position underneath it in the same column
const WEEK_COL_WIDTH = 'w-[4.5rem]';

// Combined weekly view - every team's score for every week in one table,
// scrollable sideways to see more weeks. One compact row per team by
// default (each team's combined weekly total), so as many teams as
// possible stay visible on screen at once while scrolling through weeks -
// the whole point being to compare teams against each other at a glance,
// not just track one team in isolation. Tap a team's row to expand it in
// place and reveal the per-player breakdown for that team across the same
// weeks, without leaving the table.
//
// Only ONE sticky left column now (Team) - an expanded row's player names
// render indented in that same column rather than as a second sticky
// column. A real reported rendering bug (scores visually overlapping on
// mobile) traced back to the previous two-sticky-left-columns-plus-a-
// rowSpan-based-right-column arrangement, which the file's own prior
// comment already flagged as fragile (a hardcoded pixel offset between
// the two left columns that could silently drift). Collapsing to a single
// sticky column removes that fragile arrangement entirely rather than
// patching around it.
export function WeeklyGridTable({ scores, myTeamId, awardType, duoNames }: WeeklyGridTableProps) {
    const targetWeekRef = useRef<HTMLTableCellElement | null>(null);
    const targetWeek = pickDefaultWeek(scores.weeksAvailable);
    const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(new Set());

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

    // Team's own combined weekly total, straight from the already-computed
    // WeeklyTeamScore.points - not re-derived from summing individual
    // player rows here, since that number (and how it handles a bye week)
    // is already the source of truth used everywhere else in the app.
    const weeklyTotalByTeamWeek = new Map<string, number>();
    // Per-slot, per-week detail (points + bye status) - only needed once a
    // team's row is actually expanded.
    const cellByTeamSlotWeek = new Map<string, CellData>();
    for (const w of scores.weekly) {
        weeklyTotalByTeamWeek.set(`${w.teamId}|${w.week}`, w.points);
        for (const p of w.players) {
            cellByTeamSlotWeek.set(`${w.teamId}|${p.playerIndex}|${w.week}`, { points: p.points, wasBye: !!p.wasBye });
        }
    }

    const toggleExpanded = (teamId: string) => {
        setExpandedTeamIds(prev => {
            const next = new Set(prev);
            if (next.has(teamId)) next.delete(teamId);
            else next.add(teamId);
            return next;
        });
    };

    return (
        <div className="overflow-x-auto rounded-lg border border-panel-line">
            <table className="table-fixed border-collapse">
                <colgroup>
                    <col className={TEAM_COL_WIDTH} />
                    {scores.weeksAvailable.map(w => <col key={w} className={WEEK_COL_WIDTH} />)}
                    <col className={WEEK_COL_WIDTH} />
                </colgroup>
                <thead>
                    <tr className="border-b border-panel-line">
                        <th className="sticky left-0 z-10 truncate bg-panel px-3 py-2 text-left font-mono text-xs uppercase tracking-widest text-chalk-dim">
                            Team
                        </th>
                        {scores.weeksAvailable.map(w => (
                            <th
                                key={w}
                                ref={w === targetWeek ? targetWeekRef : undefined}
                                className="whitespace-nowrap bg-panel px-3 py-2 text-right font-mono text-xs uppercase tracking-widest text-chalk-dim"
                            >
                                Wk {w}
                            </th>
                        ))}
                        <th className="sticky right-0 z-10 whitespace-nowrap bg-panel px-3 py-2 text-right font-mono text-xs uppercase tracking-widest text-chalk-dim">
                            Total
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {scores.seasonRankings.map(row => {
                        const name = duoNames?.get(duoNameKey(row.teamId, awardType));
                        const isMe = row.teamId === myTeamId;
                        const rowBg = isMe ? 'bg-bell/10' : 'bg-field';
                        const isExpanded = expandedTeamIds.has(row.teamId);
                        const slot0 = row.players.find(p => p.playerIndex === 0);
                        const slot1 = row.players.find(p => p.playerIndex === 1);
                        const slotRows: Array<{ index: 0 | 1; label: string; seasonTotal: number }> = [
                            { index: 0, label: slot0 ? `${slot0.playerName} (${slot0.playerPosition})` : '\u2013', seasonTotal: slot0?.points ?? 0 },
                            { index: 1, label: slot1 ? `${slot1.playerName} (${slot1.playerPosition})` : '\u2013', seasonTotal: slot1?.points ?? 0 }
                        ];

                        const teamRow = (
                            <tr
                                key={row.teamId}
                                onClick={() => toggleExpanded(row.teamId)}
                                className={`cursor-pointer border-b border-panel-line last:border-0 ${rowBg} hover:brightness-110`}
                            >
                                <td className={`sticky left-0 z-10 px-3 py-2 font-body text-sm text-chalk ${rowBg}`}>
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        <span className="shrink-0 text-[10px] text-chalk-dim">{isExpanded ? '\u25be' : '\u25b8'}</span>
                                        <span className="truncate">
                                            {row.teamName}
                                            {isMe && <span className="ml-1 text-xs text-bell">(You)</span>}
                                        </span>
                                    </div>
                                    {name && (
                                        <div className="truncate pl-3.5 text-xs italic text-chalk-dim">&ldquo;{name}&rdquo;</div>
                                    )}
                                </td>
                                {scores.weeksAvailable.map(w => {
                                    const combined = weeklyTotalByTeamWeek.get(`${row.teamId}|${w}`);
                                    return (
                                        <td key={w} className="whitespace-nowrap px-3 py-2 text-right font-mono text-sm text-chalk">
                                            {combined !== undefined ? combined.toFixed(1) : '\u2013'}
                                        </td>
                                    );
                                })}
                                <td className={`sticky right-0 z-10 whitespace-nowrap px-3 py-2 text-right font-mono text-sm font-semibold text-chalk ${rowBg}`}>
                                    {row.total.toFixed(1)}
                                </td>
                            </tr>
                        );

                        if (!isExpanded) return teamRow;

                        const detailRows = slotRows.map(slotRow => (
                            <tr key={`${row.teamId}-${slotRow.index}`} className={`border-b border-panel-line last:border-0 ${rowBg}`}>
                                <td title={slotRow.label} className={`sticky left-0 z-10 truncate py-1.5 pl-6 pr-3 font-mono text-xs text-chalk-dim ${rowBg}`}>
                                    {slotRow.label}
                                </td>
                                {scores.weeksAvailable.map(w => {
                                    const cell = cellByTeamSlotWeek.get(`${row.teamId}|${slotRow.index}|${w}`);
                                    return (
                                        <td key={w} className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-xs text-chalk-dim">
                                            {cell
                                                ? (cell.wasBye
                                                    ? <span className="text-brick">BYE</span>
                                                    : cell.points.toFixed(1))
                                                : '\u2013'}
                                        </td>
                                    );
                                })}
                                <td className={`sticky right-0 z-10 whitespace-nowrap px-3 py-1.5 text-right font-mono text-xs text-chalk-dim ${rowBg}`}>
                                    {slotRow.seasonTotal.toFixed(1)}
                                </td>
                            </tr>
                        ));

                        return [teamRow, ...detailRows];
                    })}
                </tbody>
            </table>
        </div>
    );
}
