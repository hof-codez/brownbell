import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useBonusResults } from '../hooks/useBonusResults';
import { useWeeklyRecap } from '../hooks/useWeeklyRecap';
import { duoNameKey } from '../hooks/useDuoNames';
import type { TeamWithDuos } from '../types';

interface ShowdownTabProps {
    teams: TeamWithDuos[];
    myTeamId?: string | null;
    /** Jumps to the bonus rules section of the Rules tab. */
    onLearnMore?: () => void;
    /** Matchups are always about the Main Award duo specifically. */
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

interface MatchupSideProps {
    team: { teamId: string; teamName: string; score: number; players: { sleeperPlayerId: string; playerName: string; playerPosition: string; points: number }[] };
    isMe: boolean;
    isWinner: boolean;
    align: 'left' | 'right';
    name?: string;
}

function MatchupSide({ team, isMe, isWinner, align, name }: MatchupSideProps) {
    const alignClass = align === 'right' ? 'items-end text-right' : 'items-start text-left';
    return (
        <div className={`flex min-w-0 flex-col ${alignClass}`}>
            <p className={`truncate font-body text-sm font-semibold ${isWinner ? 'text-chalk' : 'text-chalk-dim'}`}>
                {team.teamName}
                {isMe && <span className="ml-1 text-xs text-bell">(You)</span>}
            </p>
            {name && <p className="truncate font-body text-xs italic text-chalk-dim">&ldquo;{name}&rdquo;</p>}
            <div className="mt-1 space-y-0.5">
                {team.players.map(p => (
                    <p key={p.sleeperPlayerId} className="font-mono text-[11px] text-chalk-dim">
                        {p.playerName} ({p.playerPosition}) <span className="text-chalk">{p.points.toFixed(1)}</span>
                    </p>
                ))}
            </div>
            <p className={`mt-1.5 font-mono text-xl font-bold ${isWinner ? 'text-chalk' : 'text-chalk-dim'}`}>
                {team.score.toFixed(1)}
            </p>
        </div>
    );
}

function RecapCard({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div className="rounded-lg border border-panel-line bg-panel p-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-bell">{title}</p>
            <div className="mt-1 font-body text-sm text-chalk">{children}</div>
        </div>
    );
}

function WeeklyRecapSection({ teams, week }: { teams: TeamWithDuos[]; week: number }) {
    const { recap, loading, error } = useWeeklyRecap(teams, week);

    if (loading) return <p className="font-body text-sm text-chalk-dim">Loading recap&hellip;</p>;
    if (error) return <p className="font-body text-sm text-chalk-dim">Couldn&rsquo;t load recap: {error}</p>;
    if (!recap) return null;

    if (!recap.weekHasStarted) {
        return (
            <div className="rounded border border-dashed border-panel-line px-4 py-6 text-center">
                <p className="font-body text-sm text-chalk-dim">
                    Week {week} hasn&rsquo;t started yet &mdash; nothing to recap until real scores come in.
                </p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <RecapCard title="Upset of the Week">
                {recap.upsetOfWeek ? (
                    <>
                        <span className="font-semibold">{recap.upsetOfWeek.teamName}</span> knocked off{' '}
                        <span className="font-semibold">{recap.upsetOfWeek.opponent.teamName}</span>, overcoming a{' '}
                        {recap.upsetOfWeek.cumulativeGapBeaten.toFixed(1)}-point season gap to do it.
                    </>
                ) : <span className="text-chalk-dim">No upsets this week &mdash; chalk held.</span>}
            </RecapCard>

            <RecapCard title="Most Dominant">
                {recap.mostDominant ? (
                    <>
                        <span className="font-semibold">{recap.mostDominant.teamName}</span> demolished{' '}
                        <span className="font-semibold">{recap.mostDominant.opponent.teamName}</span> by{' '}
                        {recap.mostDominant.margin.toFixed(1)} points.
                    </>
                ) : <span className="text-chalk-dim">No matchups played yet this week.</span>}
            </RecapCard>

            <RecapCard title="Closest Call">
                {recap.closestCall ? (
                    <>
                        <span className="font-semibold">{recap.closestCall.teamA.teamName}</span> ({recap.closestCall.teamA.score.toFixed(1)}) vs{' '}
                        <span className="font-semibold">{recap.closestCall.teamB.teamName}</span> ({recap.closestCall.teamB.score.toFixed(1)})
                        &mdash; decided by just {recap.closestCall.margin.toFixed(1)} points.
                    </>
                ) : <span className="text-chalk-dim">No matchups played yet this week.</span>}
            </RecapCard>

            <RecapCard title="Next Up Spotlight">
                {recap.nextUpSpotlight ? (
                    <>
                        <span className="font-semibold">{recap.nextUpSpotlight.teamName}</span>&rsquo;s Next Up duo led the pack with{' '}
                        {recap.nextUpSpotlight.points.toFixed(1)} points.
                    </>
                ) : <span className="text-chalk-dim">No Next Up scores yet this week.</span>}
            </RecapCard>

            <RecapCard title="Most Improved">
                {recap.mostImproved ? (
                    <>
                        <span className="font-semibold">{recap.mostImproved.teamName}</span> jumped{' '}
                        {recap.mostImproved.swing.toFixed(1)} points from last week.
                    </>
                ) : <span className="text-chalk-dim">{week === 1 ? 'Nothing to compare yet - it\u2019s week 1.' : 'Not enough data yet.'}</span>}
            </RecapCard>

            <RecapCard title="Most Disappointing">
                {recap.mostDisappointing ? (
                    <>
                        <span className="font-semibold">{recap.mostDisappointing.teamName}</span> fell{' '}
                        {Math.abs(recap.mostDisappointing.swing).toFixed(1)} points from last week.
                    </>
                ) : <span className="text-chalk-dim">{week === 1 ? 'Nothing to compare yet - it\u2019s week 1.' : 'Not enough data yet.'}</span>}
            </RecapCard>

            {recap.byeWeekCasualties.length > 0 && (
                <div className="sm:col-span-2">
                    <RecapCard title="Bye Week Casualties">
                        <ul className="space-y-1">
                            {recap.byeWeekCasualties.map(c => (
                                <li key={c.teamId}>
                                    <span className="font-semibold">{c.teamName}</span> lost while{' '}
                                    <span className="font-semibold">{c.byedPlayerName}</span> was on bye.
                                </li>
                            ))}
                        </ul>
                    </RecapCard>
                </div>
            )}
        </div>
    );
}

export function ShowdownTab({ teams, myTeamId, onLearnMore, duoNames }: ShowdownTabProps) {
    const { matchupsByWeek, weeksAvailable, seasonRankings, loading, error, getHeadToHead, getUpcomingMatchup } = useBonusResults(teams);
    const [view, setView] = useState<'matchups' | 'season' | 'recap'>('matchups');
    const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

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
        return <p className="font-body text-sm text-chalk-dim">Loading showdown&hellip;</p>;
    }

    if (error) {
        return (
            <div className="rounded border border-brick/50 bg-brick/10 px-4 py-3">
                <p className="font-body text-sm text-chalk">Couldn&rsquo;t load results: {error}</p>
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
    const myOpponentDuoName = myOpponentId ? duoNames?.get(duoNameKey(myOpponentId, 'main')) : undefined;
    const myHeadToHead = myTeamId && myOpponentId ? getHeadToHead(myTeamId, myOpponentId) : null;

    return (
        <div>
            <div className="mb-4 rounded-lg border border-panel-line bg-panel/60 px-4 py-3">
                <p className="font-body text-sm text-chalk-dim">
                    Every week your Main Award duo faces off against another team&rsquo;s. Win, and you&rsquo;re in
                    the running for a bonus &mdash; the closer your combined score is to the top among that
                    week&rsquo;s winners, the bigger the bonus.
                    {onLearnMore && (
                        <>
                            {' '}
                            <button onClick={onLearnMore} className="text-bell underline underline-offset-2">
                                Full rules &rarr;
                            </button>
                        </>
                    )}
                </p>
            </div>

            {myUpcoming && myOpponentName && myHeadToHead && (
                <div className="mb-4 rounded-lg border border-bell/50 bg-bell/10 p-4">
                    <p className="font-mono text-xs uppercase tracking-widest text-bell">Your next matchup</p>
                    <p className="mt-1 font-body text-lg text-chalk">
                        Week {myUpcoming.week} vs <span className="font-semibold">{myOpponentName}</span>
                        {myOpponentDuoName && <span className="ml-1.5 text-sm italic text-chalk-dim">&ldquo;{myOpponentDuoName}&rdquo;</span>}
                    </p>
                    <p className="mt-1 font-mono text-xs text-chalk-dim">
                        All-time vs {myOpponentName}: {myHeadToHead.wins}-{myHeadToHead.losses}-{myHeadToHead.ties}
                    </p>
                </div>
            )}

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <PillToggle
                    options={[{ id: 'matchups', label: 'Matchups' }, { id: 'season', label: 'Season' }, { id: 'recap', label: 'Recap' }]}
                    value={view}
                    onChange={setView}
                />
                {(view === 'matchups' || view === 'recap') && weeksAvailable.length > 0 && (
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
                        const aHighlight = !m.played || aWins;
                        const bHighlight = !m.played || bWins;
                        const aName = duoNames?.get(duoNameKey(m.teamA.teamId, 'main'));
                        const bName = duoNames?.get(duoNameKey(m.teamB.teamId, 'main'));

                        const teamAWinPct = m.teamAWinProbability;
                        const teamBWinPct = teamAWinPct !== null ? 1 - teamAWinPct : null;
                        // The lower-probability side actually won - the "defied the
                        // odds" moment this whole feature exists to surface. Ties
                        // don't count as an upset either way.
                        const isUpset = m.played && teamAWinPct !== null && m.winnerTeamIds.length === 1 && (
                            (aWins && teamAWinPct < 0.5) || (bWins && (teamBWinPct as number) < 0.5)
                        );

                        return (
                            <div
                                key={i}
                                className={`rounded-lg border p-3 ${
                                    m.isMatchupOfTheWeek
                                        ? 'border-bell bg-bell/10 shadow-[0_0_0_1px_theme(colors.bell)]'
                                        : `border-panel-line ${involvesMe ? 'bg-bell/10' : 'bg-panel'}`
                                }`}
                            >
                                {m.isMatchupOfTheWeek && (
                                    <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-bell">
                                        &#9733; Matchup of the Week
                                    </p>
                                )}
                                {isUpset && (
                                    <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-brick">
                                        &#9889; Upset
                                    </p>
                                )}
                                <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
                                    <MatchupSide team={m.teamA} isMe={m.teamA.teamId === myTeamId} isWinner={aHighlight} align="left" name={aName} />
                                    <div className="flex flex-col items-center pt-1">
                                        <span className="rounded-full border border-panel-line bg-field px-2 py-1 font-mono text-[10px] font-bold text-chalk-dim">
                                            VS
                                        </span>
                                        {teamAWinPct !== null && teamBWinPct !== null && (
                                            <span className="mt-1 whitespace-nowrap font-mono text-[10px] text-chalk-dim">
                                                {Math.round(teamAWinPct * 100)}%-{Math.round(teamBWinPct * 100)}%
                                            </span>
                                        )}
                                    </div>
                                    <MatchupSide team={m.teamB} isMe={m.teamB.teamId === myTeamId} isWinner={bHighlight} align="right" name={bName} />
                                </div>
                                <p className="mt-2 font-mono text-xs uppercase tracking-widest text-bell">
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
                            {seasonRankings.map(row => {
                                const name = duoNames?.get(duoNameKey(row.teamId, 'main'));
                                return (
                                    <tr
                                        key={row.teamId}
                                        className={`border-b border-panel-line last:border-0 ${row.teamId === myTeamId ? 'bg-bell/10' : ''}`}
                                    >
                                        <td className="px-3 py-2 font-mono text-sm text-chalk-dim">{row.rank}</td>
                                        <td className="px-3 py-2 font-body text-sm text-chalk">
                                            {row.teamName}
                                            {name && <span className="ml-1.5 text-xs italic text-chalk-dim">&ldquo;{name}&rdquo;</span>}
                                            {row.teamId === myTeamId && <span className="ml-1.5 text-xs text-bell">(You)</span>}
                                        </td>
                                        <td className="px-3 py-2 text-center font-mono text-xs text-chalk-dim">
                                            {row.wins}-{row.losses}-{row.ties}
                                        </td>
                                        <td className="px-3 py-2 text-right font-mono text-sm font-semibold text-chalk">
                                            {row.totalBonus.toFixed(2)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {view === 'recap' && selectedWeek !== null && (
                <WeeklyRecapSection teams={teams} week={selectedWeek} />
            )}
        </div>
    );
}
