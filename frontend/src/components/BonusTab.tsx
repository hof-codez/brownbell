import { useState, useEffect } from 'react';
import { useBonusResults } from '../hooks/useBonusResults';
import type { Team } from '../types';

interface BonusTabProps {
    teams: Team[];
    myTeamId?: string | null;
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

export function BonusTab({ teams, myTeamId }: BonusTabProps) {
    const { matchupsByWeek, weeksAvailable, seasonRankings, loading, error, getHeadToHead, getUpcomingMatchup } = useBonusResults(teams);
    const [view, setView] = useState<'matchups' | 'season'>('matchups');
    const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

    // Default to my own next upcoming matchup's week if claimed, otherwise week 1
    useEffect(() => {
        if (selectedWeek !== null || weeksAvailable.length === 0) return;
        if (myTeamId) {
            const upcoming = getUpcomingMatchup(myTeamId);
            if (upcoming) {
                setSelectedWeek(upcoming.week);
                return;
            }
        }
        setSelectedWeek(weeksAvailable[0]);
    }, [weeksAvailable, selectedWeek, myTeamId, getUpcomingMatchup]);

    if (loading) {
        return <p className="font-body text-sm text-chalk-dim">Loading bonus matchups&hellip;</p>;
    }

    if (error) {
        return (
            <div className="rounded border border-brick/50 bg-brick/10 px-4 py-3">
                <p className="font-body text-sm text-chalk">Couldn&rsquo;t load bonus results: {error}</p>
            </div>
        );
    }

    const myUpcoming = myTeamId ? getUpcomingMatchup(myTeamId) : null;
    const myOpponentId = myUpcoming
        ? (myUpcoming.teamA.teamId === myTeamId ? myUpcoming.teamB.teamId : myUpcoming.teamA.teamId)
        : null;
    const myOpponentName = myUpcoming
        ? (myUpcoming.teamA.teamId === myTeamId ? myUpcoming.teamB.teamName : myUpcoming.teamA.teamName)
        : null;
    const myHeadToHead = myTeamId && myOpponentId ? getHeadToHead(myTeamId, myOpponentId) : null;

    return (
        <div>
            {myUpcoming && myOpponentName && myHeadToHead && (
                <div className="mb-4 rounded-lg border border-bell/50 bg-bell/10 p-4">
                    <p className="font-mono text-xs uppercase tracking-widest text-bell">Your next matchup</p>
                    <p className="mt-1 font-body text-lg text-chalk">
                        Week {myUpcoming.week} vs <span className="font-semibold">{myOpponentName}</span>
                    </p>
                    <p className="mt-1 font-mono text-xs text-chalk-dim">
                        All-time vs {myOpponentName}: {myHeadToHead.wins}-{myHeadToHead.losses}-{myHeadToHead.ties}
                    </p>
                </div>
            )}

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <PillToggle
                    options={[{ id: 'matchups', label: 'Matchups' }, { id: 'season', label: 'Season' }]}
                    value={view}
                    onChange={setView}
                />
                {view === 'matchups' && weeksAvailable.length > 0 && (
                    <select
                        value={selectedWeek ?? ''}
                        onChange={(e) => setSelectedWeek(Number(e.target.value))}
                        className="rounded border border-panel-line bg-field px-3 py-1.5 font-mono text-sm text-chalk"
                    >
                        {weeksAvailable.map(w => (
                            <option key={w} value={w}>Week {w}</option>
                        ))}
                    </select>
                )}
            </div>

            {view === 'matchups' && selectedWeek !== null && (
                <div className="space-y-2">
                    {(matchupsByWeek.get(selectedWeek) ?? []).map((m, i) => {
                        const aWins = m.winnerTeamIds.includes(m.teamA.teamId);
                        const bWins = m.winnerTeamIds.includes(m.teamB.teamId);
                        const involvesMe = m.teamA.teamId === myTeamId || m.teamB.teamId === myTeamId;
                        return (
                            <div
                                key={i}
                                className={`rounded-lg border border-panel-line p-3 ${involvesMe ? 'bg-bell/10' : 'bg-panel'}`}
                            >
                                <div className="flex items-center justify-between">
                                    <p className={`font-body text-sm ${!m.played || aWins ? 'text-chalk' : 'text-chalk-dim'}`}>
                                        {m.teamA.teamName}
                                        {m.teamA.teamId === myTeamId && <span className="ml-1 text-xs text-bell">(You)</span>}
                                    </p>
                                    {m.played && (
                                        <p className={`font-mono text-sm font-semibold ${aWins ? 'text-chalk' : 'text-chalk-dim'}`}>
                                            {m.teamA.score.toFixed(1)}
                                        </p>
                                    )}
                                </div>
                                <div className="my-1 border-t border-dashed border-panel-line" />
                                <div className="flex items-center justify-between">
                                    <p className={`font-body text-sm ${!m.played || bWins ? 'text-chalk' : 'text-chalk-dim'}`}>
                                        {m.teamB.teamName}
                                        {m.teamB.teamId === myTeamId && <span className="ml-1 text-xs text-bell">(You)</span>}
                                    </p>
                                    {m.played && (
                                        <p className={`font-mono text-sm font-semibold ${bWins ? 'text-chalk' : 'text-chalk-dim'}`}>
                                            {m.teamB.score.toFixed(1)}
                                        </p>
                                    )}
                                </div>
                                <p className="mt-1.5 font-mono text-xs uppercase tracking-widest text-bell">
                                    {!m.played
                                        ? 'Upcoming - not played yet'
                                        : m.winnerTeamIds.length === 2
                                            ? `Tie - Tier ${m.tier} split, +${m.bonusPointsEach.toFixed(2)} each`
                                            : `Final - Tier ${m.tier} win, +${m.bonusPointsEach.toFixed(2)} bonus`}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}

            {view === 'season' && (
                <div className="overflow-hidden rounded-lg border border-panel-line">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-panel-line bg-panel">
                                <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-widest text-chalk-dim">#</th>
                                <th className="px-3 py-2 text-left font-mono text-xs uppercase tracking-widest text-chalk-dim">Team</th>
                                <th className="px-3 py-2 text-center font-mono text-xs uppercase tracking-widest text-chalk-dim">W-L-T</th>
                                <th className="px-3 py-2 text-right font-mono text-xs uppercase tracking-widest text-chalk-dim">Bonus</th>
                            </tr>
                        </thead>
                        <tbody>
                            {seasonRankings.map(row => (
                                <tr
                                    key={row.teamId}
                                    className={`border-b border-panel-line last:border-0 ${row.teamId === myTeamId ? 'bg-bell/10' : ''}`}
                                >
                                    <td className="px-3 py-2 font-mono text-sm text-chalk-dim">{row.rank}</td>
                                    <td className="px-3 py-2 font-body text-sm text-chalk">
                                        {row.teamName}
                                        {row.teamId === myTeamId && <span className="ml-1.5 text-xs text-bell">(You)</span>}
                                    </td>
                                    <td className="px-3 py-2 text-center font-mono text-xs text-chalk-dim">
                                        {row.wins}-{row.losses}-{row.ties}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono text-sm font-semibold text-chalk">
                                        {row.totalBonus.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
