import { useState, useEffect } from 'react';
import { useActivityLog } from '../hooks/useActivityLog';
import type { ActivityBadge } from '../hooks/useActivityLog';
import { useStatCorrections } from '../hooks/useStatCorrections';
import type { Team } from '../types';

interface HistoryTabProps {
    teams: Team[];
    /** Pre-filters the log to just this team, with a visible "clear" option
     * to see everyone again - set when arriving here via a team card's
     * History link rather than by picking the Misc tab directly. */
    teamFilter?: string | null;
    onClearFilter?: () => void;
}

const BADGE_STYLES: Record<ActivityBadge, string> = {
    SET: 'bg-bell/20 text-bell',
    SUB: 'bg-bell/20 text-bell',
    'TRADE-SUB': 'bg-brick/20 text-brick',
    'AUTO-SUB': 'bg-panel-line text-chalk-dim',
    'AUTO-TRADE': 'bg-brick/20 text-brick',
    REVERTED: 'bg-bell/20 text-bell',
    CLEARED: 'bg-panel-line text-chalk-dim',
    'NO-SUB': 'bg-brick/20 text-brick',
    'ADMIN-FIX': 'bg-brick/20 text-brick',
    STANDBY: 'bg-yellow-500/20 text-yellow-500'
};

function StatCorrectionsSection({ teams }: { teams: Team[] }) {
    const { corrections, loading, error } = useStatCorrections(teams);

    if (loading || error || corrections.length === 0) return null;

    return (
        <div className="mb-4">
            <p className="mb-1.5 font-mono text-xs uppercase tracking-widest text-brick">
                &#9888; Stat Corrections
            </p>
            <div className="space-y-1.5">
                {corrections.map(c => (
                    <div key={c.id} className="rounded-lg border border-brick/50 bg-brick/10 p-3">
                        <div className="flex items-center justify-between">
                            <span className="font-body text-sm text-chalk">{c.teamName}</span>
                            <span className="whitespace-nowrap font-mono text-xs text-chalk-dim">Week {c.week}</span>
                        </div>
                        <p className="mt-1 font-body text-sm text-chalk-dim">
                            Sleeper corrected this result after it was already final &mdash; score changed from{' '}
                            <span className="text-chalk">{c.originalTeamScore.toFixed(1)}</span> to{' '}
                            <span className="text-chalk">{c.correctedTeamScore.toFixed(1)}</span>
                            {c.originalOutcome !== c.correctedOutcome && (
                                <>, outcome changed from <span className="text-chalk">{c.originalOutcome}</span> to{' '}
                                <span className="text-chalk">{c.correctedOutcome}</span></>
                            )}
                            {c.originalTier !== c.correctedTier && (
                                <>, tier changed from <span className="text-chalk">{c.originalTier ?? '\u2013'}</span> to{' '}
                                <span className="text-chalk">{c.correctedTier ?? '\u2013'}</span></>
                            )}
                            {c.originalBonusPoints !== c.correctedBonusPoints && (
                                <>, bonus changed from <span className="text-chalk">{c.originalBonusPoints.toFixed(2)}</span> to{' '}
                                <span className="text-chalk">{c.correctedBonusPoints.toFixed(2)}</span></>
                            )}
                            .
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}

export function HistoryTab({ teams, teamFilter, onClearFilter }: HistoryTabProps) {
    const { entries: allEntries, loading, error } = useActivityLog(teams);
    const teamFilteredEntries = teamFilter ? allEntries.filter(e => e.teamId === teamFilter) : allEntries;
    const filteredTeamName = teamFilter ? teams.find(t => t.id === teamFilter)?.display_name : null;

    // Distinct weeks with any recorded activity, most recent first -
    // derived from the actual data rather than a fixed season length, so
    // this naturally grows as new weeks accumulate real history. Computed
    // from the FULL entry list (not the team-filtered one), so the
    // dropdown's own options stay stable regardless of which team filter
    // happens to be active - a team with no activity in a given week
    // still sees that week as a choice, just with the existing empty
    // state below once selected.
    const weeksAvailable = Array.from(new Set<number>(allEntries.map(e => e.week))).sort((a, b) => b - a);

    const [selectedWeek, setSelectedWeek] = useState<number | 'all' | null>(null);

    // Defaults to the most recent week with any activity, not "all" - the
    // common case when opening History is checking what just happened,
    // not scrolling a whole season's worth of entries every time. Only
    // fires once real data has actually arrived (selectedWeek starts
    // null before the fetch resolves), and only sets a default once -
    // an owner's own explicit choice (including picking "All weeks")
    // is never overridden afterward.
    useEffect(() => {
        if (selectedWeek !== null || weeksAvailable.length === 0) return;
        setSelectedWeek(weeksAvailable[0]);
    }, [weeksAvailable, selectedWeek]);

    const entries = selectedWeek === 'all' || selectedWeek === null
        ? teamFilteredEntries
        : teamFilteredEntries.filter(e => e.week === selectedWeek);

    return (
        <div>
            {weeksAvailable.length > 0 && (
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold uppercase tracking-wide text-chalk">History</h2>
                    <select
                        value={selectedWeek === 'all' ? 'all' : (selectedWeek ?? '')}
                        onChange={(e) => setSelectedWeek(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                        className="rounded border border-panel-line bg-field px-3 py-1.5 font-mono text-sm text-chalk"
                    >
                        {weeksAvailable.map(w => (
                            <option key={w} value={w}>Week {w}</option>
                        ))}
                        <option value="all">All weeks</option>
                    </select>
                </div>
            )}

            {filteredTeamName && (
                <div className="mb-3 flex items-center justify-between rounded border border-panel-line bg-panel/60 px-3 py-2">
                    <span className="font-body text-sm text-chalk-dim">
                        Showing only <span className="text-chalk">{filteredTeamName}</span>
                    </span>
                    {onClearFilter && (
                        <button onClick={onClearFilter} className="font-mono text-[10px] uppercase tracking-widest text-bell">
                            Show everyone
                        </button>
                    )}
                </div>
            )}

            <StatCorrectionsSection teams={teams} />

            {loading ? (
                <p className="font-body text-sm text-chalk-dim">Loading activity log&hellip;</p>
            ) : error ? (
                <div className="rounded border border-brick/50 bg-brick/10 px-4 py-3">
                    <p className="font-body text-sm text-chalk">Couldn&rsquo;t load history: {error}</p>
                </div>
            ) : entries.length === 0 ? (
                <div className="rounded border border-dashed border-panel-line px-4 py-6 text-center">
                    <p className="font-body text-sm text-chalk-dim">
                        {(() => {
                            const weekPart = selectedWeek === 'all' || selectedWeek === null ? 'this season' : `in Week ${selectedWeek}`;
                            return filteredTeamName
                                ? `No changes recorded for ${filteredTeamName} ${weekPart}.`
                                : `No changes recorded ${weekPart}.`;
                        })()}
                    </p>
                </div>
            ) : (
                <div className="space-y-1.5">
                    {entries.map(entry => (
                        <div key={entry.id} className="flex items-start justify-between rounded-lg border border-panel-line bg-panel p-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${BADGE_STYLES[entry.badge]}`}>
                                        {entry.badge}
                                    </span>
                                    <span className="font-body text-sm text-chalk">{entry.teamName}</span>
                                    <span className="font-mono text-xs uppercase tracking-wide text-chalk-dim">
                                        {entry.awardType === 'main' ? 'Brown Bell' : entry.awardType === 'boom' ? 'Boom' : 'Next Up'}
                                    </span>
                                </div>
                                <p className="mt-1 font-body text-sm text-chalk-dim">
                                    {entry.originalName === '(not set)' ? (
                                        <>Set to <span className="text-chalk">{entry.substituteName} ({entry.substitutePosition})</span></>
                                    ) : entry.badge === 'NO-SUB' ? (
                                        entry.substituteName === null && entry.reason?.includes('left in slot') ? (
                                            <>No eligible replacement for <span className="text-chalk">{entry.originalName} ({entry.originalPosition})</span> - left in slot</>
                                        ) : (
                                            <>No eligible replacement for <span className="text-chalk">{entry.originalName} ({entry.originalPosition})</span> - slot cleared, awaiting owner pick</>
                                        )
                                    ) : entry.badge === 'CLEARED' ? (
                                        <><span className="text-chalk">{entry.originalName} ({entry.originalPosition})</span> departed - slot cleared, awaiting owner pick</>
                                    ) : entry.badge === 'ADMIN-FIX' ? (
                                        <>
                                            <span className="text-chalk">{entry.originalName} ({entry.originalPosition})</span> &rarr;{' '}
                                            <span className="text-chalk">{entry.substituteName} ({entry.substitutePosition})</span>
                                            {entry.reason && <><br />{entry.reason}</>}
                                        </>
                                    ) : entry.badge === 'STANDBY' ? (
                                        <>
                                            <span className="text-chalk">{entry.originalName} ({entry.originalPosition})</span> &rarr;{' '}
                                            <span className="text-chalk">{entry.substituteName} ({entry.substitutePosition})</span>
                                            {entry.reason && <><br />{entry.reason}</>}
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-chalk">{entry.originalName} ({entry.originalPosition})</span> &rarr;{' '}
                                            <span className="text-chalk">{entry.substituteName} ({entry.substitutePosition})</span>
                                        </>
                                    )}
                                </p>
                            </div>
                            <p className="whitespace-nowrap font-mono text-xs text-chalk-dim">Week {entry.week}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
