import { useState } from 'react';
import { usePlayerNews } from '../hooks/usePlayerNews';

interface PlayerNewsModalProps {
    playerName: string;
    sleeperPlayerId: string | null;
    onClose: () => void;
}

const PAGE_SIZE = 5;

function formatPublished(iso: string): string {
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' at ' +
        date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function PlayerNewsModal({ playerName, sleeperPlayerId, onClose }: PlayerNewsModalProps) {
    const { items, loading } = usePlayerNews(sleeperPlayerId); // up to 15, most recent first
    // Starts showing just the most recent 5 - "Show more" reveals the
    // next 5 at a time, up to all 15 fetched. Resets naturally to 5 each
    // time this modal reopens, since only one instance ever exists and it
    // fully unmounts between different players (see App.tsx) rather than
    // being reused in place.
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const visibleItems = items.slice(0, visibleCount);
    const hasMore = visibleCount < items.length;

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true">
            <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-lg border border-panel-line bg-panel p-5 sm:rounded-lg">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-display text-xl font-bold uppercase tracking-wide text-chalk">{playerName}</h2>
                    <button onClick={onClose} className="font-mono text-xs uppercase tracking-widest text-chalk-dim">
                        Close
                    </button>
                </div>

                {loading && <p className="font-body text-sm italic text-chalk-dim">Loading recent news...</p>}

                {!loading && items.length === 0 && (
                    <p className="font-body text-sm italic text-chalk-dim">No recent news found for this player.</p>
                )}

                {!loading && items.length > 0 && (
                    <div className="space-y-4">
                        {visibleItems.map(item => (
                            <div key={item.id} className="border-b border-panel-line pb-3 last:border-0 last:pb-0">
                                <p className="font-body text-sm font-semibold text-chalk">{item.headline}</p>
                                {item.snippet && <p className="mt-1 font-body text-sm text-chalk-dim">{item.snippet}</p>}
                                <div className="mt-1.5 flex items-center justify-between">
                                    <span className="font-mono text-[10px] uppercase tracking-wide text-chalk-dim">
                                        {formatPublished(item.publishedAt)}
                                    </span>
                                    <a
                                        href={item.sourceUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-[10px] uppercase tracking-widest text-bell"
                                    >
                                        Via {item.sourceName || 'RotoWire.com'}
                                    </a>
                                </div>
                            </div>
                        ))}

                        {hasMore && (
                            <button
                                onClick={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, items.length))}
                                className="w-full rounded border border-panel-line py-2 text-center font-mono text-xs uppercase tracking-widest text-bell"
                            >
                                Show {Math.min(PAGE_SIZE, items.length - visibleCount)} more
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
