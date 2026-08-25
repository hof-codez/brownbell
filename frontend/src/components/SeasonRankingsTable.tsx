import type { AwardScores } from '../hooks/useLeagueScores';

interface SeasonRankingsTableProps {
    scores: AwardScores;
    myTeamId?: string | null;
}

// Left-border accent + rank-number color, not a full background tint - keeps
// this from clashing with the separate "your team" highlight when a top-3
// team is also the claimed team.
const RANK_ACCENT: Record<number, { border: string; text: string }> = {
    1: { border: 'border-l-4 border-l-[#D4AF37]', text: 'text-[#D4AF37]' }, // gold
    2: { border: 'border-l-4 border-l-[#C7CDD3]', text: 'text-[#C7CDD3]' }, // silver
    3: { border: 'border-l-4 border-l-[#B08D57]', text: 'text-[#B08D57]' }  // bronze
};

export function SeasonRankingsTable({ scores, myTeamId }: SeasonRankingsTableProps) {
    return (
        <div className="overflow-hidden rounded-lg border border-panel-line">
            <table className="w-full">
                <thead>
                    <tr className="border-b border-panel-line bg-panel">
                        <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-widest text-chalk-dim">#</th>
                        <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-widest text-chalk-dim">Team</th>
                        <th className="px-3 py-2 text-right font-mono text-xs uppercase tracking-widest text-chalk-dim">Total</th>
                    </tr>
                </thead>
                <tbody>
                    {scores.seasonRankings.map(row => {
                        const accent = RANK_ACCENT[row.rank];
                        return (
                            <tr
                                key={row.teamId}
                                className={`border-b border-panel-line last:border-0 ${accent?.border ?? ''} ${row.teamId === myTeamId ? 'bg-bell/10' : ''}`}
                            >
                                <td className={`px-3 py-2 align-top font-mono text-sm font-semibold ${accent?.text ?? 'text-chalk-dim'}`}>
                                    {row.rank}
                                </td>
                                <td className="px-3 py-2 align-top font-body text-sm text-chalk">
                                    <div>
                                        {row.teamName}
                                        {row.teamId === myTeamId && <span className="ml-1.5 text-xs text-bell">(You)</span>}
                                    </div>
                                    {row.players.length > 0 && (
                                        <div className="mt-0.5 font-mono text-xs text-chalk-dim">
                                            {row.players.map((p, i) => (
                                                <span key={p.sleeperPlayerId}>
                                                    {i > 0 && ' \u00b7 '}
                                                    {p.playerName} ({p.playerPosition}) {p.points.toFixed(1)}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </td>
                                <td className="px-3 py-2 text-right align-top font-mono text-sm font-semibold text-chalk">
                                    {row.total.toFixed(1)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
