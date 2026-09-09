import { useMemo, useState } from 'react';
import { useActivityLog } from '../hooks/useActivityLog';
import type { ActivityBadge } from '../hooks/useActivityLog';
import { useTeamPlayerNews } from '../hooks/useTeamPlayerNews';
import type { TeamWithDuos, AwardType } from '../types';

interface MyPlayersTabProps {
    myTeam: TeamWithDuos;
}

const BADGE_STYLES: Record<ActivityBadge, string> = {
    SET: 'bg-bell/20 text-bell',
    SUB: 'bg-bell/20 text-bell',
    'TRADE-SUB': 'bg-brick/20 text-brick',
    'AUTO-SUB': 'bg-panel-line text-chalk-dim',
    'AUTO-TRADE': 'bg-brick/20 text-brick',
    REVERTED: 'bg-bell/20 text-bell',
    CLEARED: 'bg-panel-line text-chalk-dim',
    'NO-SUB': 'bg-brick/20 text-brick'
};

// One merged, chronological entry - either an app-tracked activity event
// (injury, swap, revert) or an external RotoWire news item, tagged so the
// render can distinguish them.
type FeedEntry =
    | { kind: 'activity'; timestamp: string; id: string; awardType: AwardType; badge: ActivityBadge; originalName: string; originalPosition: string; substituteName: string | null; substitutePosition: string | null }
    | { kind: 'news'; timestamp: string; id: string; sleeperPlayerId: string | null; playerName: string; headline: string; snippet: string; sourceName: string | null; sourceUrl: string };

function formatTimestamp(iso: string): string {
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' at ' +
        date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function MyPlayersTab({ myTeam }: MyPlayersTabProps) {
    // Stable reference - useActivityLog's internal effect depends on this
    // array by identity, so a fresh [myTeam.team] literal on every render
    // would re-trigger it endlessly, cancelling each in-flight fetch
    // before it can ever resolve and leaving the tab stuck on "Loading...".
    const activityTeams = useMemo(() => [myTeam.team], [myTeam.team.id]);
    const { entries: activityEntries, loading: activityLoading } = useActivityLog(activityTeams);

    // One tab per current duo player, for direct navigation to just their
    // own activity/news rather than scrolling the full combined feed.
    // Deduplicated by sleeperPlayerId (falling back to name if a slot
    // hasn't been set yet and has no id) since cross-award exclusivity
    // means the same player never legitimately occupies two slots, but a
    // defensive dedup costs nothing.
    const playerTabs = useMemo(() => {
        const slots = [...myTeam.main, ...myTeam.nextup, ...myTeam.boom].filter((s): s is NonNullable<typeof s> => !!s);
        const seen = new Set<string>();
        const tabs: { key: string; sleeperPlayerId: string | null; playerName: string }[] = [];
        for (const slot of slots) {
            const key = slot.sleeper_player_id || slot.player_name;
            if (seen.has(key)) continue;
            seen.add(key);
            tabs.push({ key, sleeperPlayerId: slot.sleeper_player_id, playerName: slot.player_name });
        }
        return tabs;
    }, [myTeam]);

    const [selectedKey, setSelectedKey] = useState<string | null>(null); // null = "All"

    const sleeperPlayerIds = playerTabs.map(t => t.sleeperPlayerId).filter((id): id is string => !!id);
    const { items: newsItems, loading: newsLoading } = useTeamPlayerNews(sleeperPlayerIds);

    const loading = activityLoading || newsLoading;

    const feed: FeedEntry[] = [
        ...activityEntries.map((e): FeedEntry => ({
            kind: 'activity',
            timestamp: e.createdAt,
            id: e.id,
            awardType: e.awardType,
            badge: e.badge,
            originalName: e.originalName,
            originalPosition: e.originalPosition,
            substituteName: e.substituteName,
            substitutePosition: e.substitutePosition
        })),
        ...newsItems.map((n): FeedEntry => ({
            kind: 'news',
            timestamp: n.publishedAt,
            id: n.id,
            sleeperPlayerId: n.sleeperPlayerId,
            playerName: n.playerName,
            headline: n.headline,
            snippet: n.snippet,
            sourceName: n.sourceName,
            sourceUrl: n.sourceUrl
        }))
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const selectedTab = playerTabs.find(t => t.key === selectedKey);
    const filteredFeed = !selectedTab ? feed : feed.filter(entry =>
        entry.kind === 'news'
            ? (selectedTab.sleeperPlayerId ? entry.sleeperPlayerId === selectedTab.sleeperPlayerId : entry.playerName === selectedTab.playerName)
            : (entry.originalName === selectedTab.playerName || entry.substituteName === selectedTab.playerName)
    );

    return (
        <div>
            <h2 className="mb-3 font-display text-xl font-bold uppercase tracking-wide text-chalk">My Players</h2>
            <p className="mb-4 font-body text-sm text-chalk-dim">
                A combined feed of activity and news for every player currently in one of your three awards.
            </p>

            <div className="mb-4 flex flex-wrap gap-1.5">
                <button
                    onClick={() => setSelectedKey(null)}
                    className={`rounded px-2.5 py-1 font-mono text-xs uppercase tracking-widest ${!selectedTab ? 'bg-bell/20 text-bell' : 'text-chalk-dim'}`}
                >
                    All
                </button>
                {playerTabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setSelectedKey(tab.key)}
                        className={`rounded px-2.5 py-1 font-mono text-xs uppercase tracking-widest ${selectedKey === tab.key ? 'bg-bell/20 text-bell' : 'text-chalk-dim'}`}
                    >
                        {tab.playerName}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="rounded border border-dashed border-panel-line px-4 py-6 text-center">
                    <p className="font-body text-sm text-chalk-dim">Loading...</p>
                </div>
            ) : filteredFeed.length === 0 ? (
                <div className="rounded border border-dashed border-panel-line px-4 py-6 text-center">
                    <p className="font-body text-sm text-chalk-dim">
                        {selectedTab ? `No activity or news yet for ${selectedTab.playerName}.` : 'No activity or news yet for your players.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-1.5">
                    {filteredFeed.map(entry =>
                        entry.kind === 'activity' ? (
                            <div key={`activity-${entry.id}`} className="flex items-start justify-between rounded-lg border border-panel-line bg-panel p-3">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide ${BADGE_STYLES[entry.badge]}`}>
                                            {entry.badge}
                                        </span>
                                        <span className="font-mono text-xs uppercase tracking-wide text-chalk-dim">
                                            {entry.awardType === 'main' ? 'Brown Bell' : entry.awardType === 'boom' ? 'Boom' : 'Next Up'}
                                        </span>
                                    </div>
                                    <p className="mt-1 font-body text-sm text-chalk-dim">
                                        {entry.originalName === '(not set)' ? (
                                            <>Set to <span className="text-chalk">{entry.substituteName} ({entry.substitutePosition})</span></>
                                        ) : entry.substituteName ? (
                                            <>
                                                <span className="text-chalk">{entry.originalName} ({entry.originalPosition})</span> &rarr;{' '}
                                                <span className="text-chalk">{entry.substituteName} ({entry.substitutePosition})</span>
                                            </>
                                        ) : (
                                            <><span className="text-chalk">{entry.originalName} ({entry.originalPosition})</span> - slot cleared, awaiting owner pick</>
                                        )}
                                    </p>
                                </div>
                                <p className="whitespace-nowrap font-mono text-xs text-chalk-dim">{formatTimestamp(entry.timestamp)}</p>
                            </div>
                        ) : (
                            <div key={`news-${entry.id}`} className="rounded-lg border border-panel-line bg-panel p-3">
                                <div className="flex items-center gap-2">
                                    <span className="rounded bg-bell/20 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-bell">
                                        News
                                    </span>
                                    <span className="font-body text-sm text-chalk">{entry.playerName}</span>
                                </div>
                                <a
                                    href={entry.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-1 inline-block font-body text-sm font-semibold text-chalk underline decoration-dotted decoration-chalk-dim underline-offset-2"
                                >
                                    {entry.headline} <span aria-hidden="true">&#8599;</span>
                                </a>
                                {entry.snippet && <p className="mt-0.5 font-body text-sm text-chalk-dim">{entry.snippet}</p>}
                                <div className="mt-1.5 flex items-center justify-between">
                                    <span className="font-mono text-[10px] uppercase tracking-wide text-chalk-dim">{formatTimestamp(entry.timestamp)}</span>
                                    <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] uppercase tracking-widest text-bell">
                                        Via {entry.sourceName || 'RotoWire.com'}
                                    </a>
                                </div>
                            </div>
                        )
                    )}
                </div>
            )}
        </div>
    );
}
