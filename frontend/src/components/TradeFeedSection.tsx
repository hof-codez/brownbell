import { useState } from 'react';
import { useTradeFeed } from '../hooks/useTradeFeed';
import type { FeedAsset, FeedSide, FeedTrade } from '../hooks/useTradeFeed';
import { calculatorHref } from '../lib/calculatorLink';

const label = (a: FeedAsset) =>
    a.pickYear ? `${a.pickYear} round ${a.pickRound} pick` : `${a.name}${a.position ? ` (${a.position})` : ''}`;

function Side({ side, gets, won }: { side: FeedSide; gets: FeedAsset[]; won: boolean }) {
    return (
        <div className="min-w-0 flex-1">
            <p className={`font-body text-sm ${won ? 'text-bell' : 'text-chalk'}`}>{side.name} gets</p>
            <ul className="mt-0.5 font-body text-xs text-chalk-dim">
                {gets.map(a => <li key={a.id}>{label(a)}</li>)}
            </ul>
        </div>
    );
}

function verdict(t: FeedTrade) {
    if (t.winner === 'even') return 'Even trade by league values';
    const name = t.winner === 'a' ? t.teamA.name : t.teamB.name;
    return `${name} came out ahead by ${t.gapPct}%`;
}

// Real league trades with a fairness read from the trade calculator's published values.
// Collapsed until opened so the History tab stays light.
export function TradeFeedSection() {
    const [open, setOpen] = useState(false);
    const { trades, error } = useTradeFeed(open);

    return (
        <section className="mb-4 rounded-lg border border-panel-line bg-panel">
            <button
                onClick={() => setOpen(o => !o)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left"
                aria-expanded={open}
            >
                <span className="font-mono text-xs uppercase tracking-widest text-chalk">League trades</span>
                <span className="font-mono text-xs text-chalk-dim">{open ? 'Hide' : 'Show'}</span>
            </button>
            {open && (
                <div className="space-y-1.5 border-t border-panel-line p-3">
                    {error ? (
                        <p className="font-body text-sm text-chalk-dim">{error}</p>
                    ) : trades === null ? (
                        <p className="font-body text-sm text-chalk-dim">Loading trades&hellip;</p>
                    ) : trades.length === 0 ? (
                        <p className="font-body text-sm text-chalk-dim">
                            No league trades loaded yet. They appear after the next trade calculator sync.
                        </p>
                    ) : (
                        trades.map(t => (
                            <div key={t.id} className="rounded border border-panel-line bg-field/40 p-3">
                                <div className="flex gap-3">
                                    <Side side={t.teamA} gets={t.teamB.gave} won={t.winner === 'a'} />
                                    <Side side={t.teamB} gets={t.teamA.gave} won={t.winner === 'b'} />
                                </div>
                                <div className="mt-2 flex items-center justify-between">
                                    <p className="font-mono text-[10px] uppercase tracking-wide text-chalk-dim">{verdict(t)}</p>
                                    <p className="font-mono text-[10px] text-chalk-dim">
                                        {new Date(t.happenedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                    <a
                        href={calculatorHref()}
                        className="mt-1 inline-block font-mono text-[10px] uppercase tracking-widest text-bell"
                    >
                        Open trade calculator &rarr;
                    </a>
                </div>
            )}
        </section>
    );
}
