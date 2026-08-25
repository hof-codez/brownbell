import { useActivityLog } from '../hooks/useActivityLog';
import type { ActivityBadge } from '../hooks/useActivityLog';
import type { Team } from '../types';

interface HistoryTabProps {
    teams: Team[];
}

const BADGE_STYLES: Record<ActivityBadge, string> = {
    SET: 'bg-bell/20 text-bell',
    SUB: 'bg-bell/20 text-bell',
    'TRADE-SUB': 'bg-brick/20 text-brick',
    'AUTO-SUB': 'bg-panel-line text-chalk-dim',
    'AUTO-TRADE': 'bg-brick/20 text-brick',
    REVERTED: 'bg-bell/20 text-bell',
    CLEARED: 'bg-panel-line text-chalk-dim'
};

export function HistoryTab({ teams }: HistoryTabProps) {
    const { entries, loading, error } = useActivityLog(teams);

    if (loading) {
        return <p className="font-body text-sm text-chalk-dim">Loading activity log&hellip;</p>;
    }

    if (error) {
        return (
            <div className="rounded border border-brick/50 bg-brick/10 px-4 py-3">
                <p className="font-body text-sm text-chalk">Couldn&rsquo;t load history: {error}</p>
            </div>
        );
    }

    if (entries.length === 0) {
        return (
            <div className="rounded border border-dashed border-panel-line px-4 py-6 text-center">
                <p className="font-body text-sm text-chalk-dim">No changes recorded yet this season.</p>
            </div>
        );
    }

    return (
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
                                {entry.awardType === 'main' ? 'Main' : 'Next Up'}
                            </span>
                        </div>
                        <p className="mt-1 font-body text-sm text-chalk-dim">
                            {entry.originalName === '(not set)' ? (
                                <>Set to <span className="text-chalk">{entry.substituteName} ({entry.substitutePosition})</span></>
                            ) : entry.badge === 'CLEARED' ? (
                                <><span className="text-chalk">{entry.originalName} ({entry.originalPosition})</span> departed - slot cleared, awaiting owner pick</>
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
    );
}
