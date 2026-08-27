import type { AwardScores } from '../hooks/useLeagueScores';
import type { AwardType } from '../types';
import { duoNameKey } from '../hooks/useDuoNames';

interface SeasonRankingsTableProps {
    scores: AwardScores;
    myTeamId?: string | null;
    awardType: AwardType;
    duoNames?: Map<string, string>;
    /** Main Award season points + bonus points combined is what actually
     * decides the Brown Bell Award - when provided (Main Award view only,
     * since Next Up has no bonus mechanic), rows are re-sorted and re-ranked
     * by that combined number, not the raw season total alone. */
    bonusTotals?: Map<string, number>;
}

// Left-border accent + rank-number color, not a full background tint - keeps
// this from clashing with the separate "your team" highlight when a top-3
// team is also the claimed team.
const RANK_ACCENT: Record<number, { border: string; text: string }> = {
    1: { border: 'border-l-4 border-l-[#D4AF37]', text: 'text-[#D4AF37]' }, // gold
    2: { border: 'border-l-4 border-l-[#C7CDD3]', text: 'text-[#C7CDD3]' }, // silver
    3: { border: 'border-l-4 border-l-[#B08D57]', text: 'text-[#B08D57]' }  // bronze
};

export function SeasonRankingsTable({ scores, myTeamId, awardType, duoNames, bonusTotals }: SeasonRankingsTableProps) {
    const showCombined = !!bonusTotals;

    const rows = showCombined
        ? [...scores.seasonRankings]
            .map(row => {
                const bonus = bonusTotals!.get(row.teamId) || 0;
                return { ...row, bonus, combined: row.total + bonus };
            })
            .sort((a, b) => b.combined - a.combined)
            .map((row, i) => ({ ...row, rank: i + 1 }))
        : scores.seasonRankings.map(row => ({ ...row, bonus: 0, combined: row.total }));

    return (
        <div className="overflow-hidden rounded-lg border border-panel-line">
            {/* Deliberately only 3 real columns (#, Team, the headline number) on
                every screen size, mobile included - a 5-column table (adding
                separate Season/Bonus columns) doesn't fit a phone width once the
                Team cell has any real content in it. The Season/Bonus breakdown
                lives as a sub-line instead, same pattern as the player breakdown
                right below it. */}
            <table className="w-full table-fixed">
                <colgroup>
                    <col className="w-10" />
                    <col />
                    <col className="w-20" />
                </colgroup>
                <thead>
                    <tr className="border-b border-panel-line bg-panel">
                        <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-widest text-chalk-dim">#</th>
                        <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-widest text-chalk-dim">Team</th>
                        <th className="px-3 py-2 text-right font-mono text-xs uppercase tracking-widest text-chalk-dim">
                            {showCombined ? 'Combined' : 'Total'}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const accent = RANK_ACCENT[row.rank];
                        const name = duoNames?.get(duoNameKey(row.teamId, awardType));
                        return (
                            <tr
                                key={row.teamId}
                                className={`border-b border-panel-line last:border-0 ${accent?.border ?? ''} ${row.teamId === myTeamId ? 'bg-bell/10' : ''}`}
                            >
                                <td className={`px-3 py-2 align-top font-mono text-sm font-semibold ${accent?.text ?? 'text-chalk-dim'}`}>
                                    {row.rank}
                                </td>
                                <td className="min-w-0 px-3 py-2 align-top font-body text-sm text-chalk">
                                    <div className="truncate">
                                        {row.teamName}
                                        {name && <span className="ml-1.5 text-xs italic text-chalk-dim">&ldquo;{name}&rdquo;</span>}
                                        {row.teamId === myTeamId && <span className="ml-1.5 text-xs text-bell">(You)</span>}
                                    </div>
                                    {row.players.length > 0 && (
                                        <div className="mt-0.5 space-y-0.5 font-mono text-xs text-chalk-dim">
                                            {row.players.map(p => (
                                                <div key={p.sleeperPlayerId} className="truncate">
                                                    {p.playerName} ({p.playerPosition}) {p.points.toFixed(1)}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {showCombined && (
                                        <div className="mt-0.5 font-mono text-xs text-chalk-dim">
                                            Season {row.total.toFixed(1)} &middot; Bonus {row.bonus > 0 ? `+${row.bonus.toFixed(1)}` : row.bonus.toFixed(1)}
                                        </div>
                                    )}
                                </td>
                                <td className="px-3 py-2 text-right align-top font-mono text-sm font-semibold text-chalk">
                                    {row.combined.toFixed(1)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
