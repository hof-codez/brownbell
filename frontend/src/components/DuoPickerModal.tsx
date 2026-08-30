import { useEffect, useState } from 'react';
import type { AwardType, EligibleRosterResponse, EligibleCandidate } from '../types';

// Preferred ordering for offensive positions specifically - IDP positions
// (DL/LB/DB) and anything else not in this list still get included, just
// appended afterward. A candidate's position not being anticipated here is
// never a reason to silently drop them from the list.
const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K'];

function groupByPosition(candidates: EligibleCandidate[]): [string, EligibleCandidate[]][] {
    const groups = new Map<string, EligibleCandidate[]>();
    for (const c of candidates) {
        const list = groups.get(c.position) || [];
        list.push(c);
        groups.set(c.position, list);
    }
    const orderedKnown = POSITION_ORDER.filter(pos => groups.has(pos));
    const remaining = [...groups.keys()].filter(pos => !POSITION_ORDER.includes(pos)).sort();
    return [...orderedKnown, ...remaining].map(pos => [pos, groups.get(pos)!]);
}

interface DuoPickerModalProps {
    awardType: AwardType;
    playerIndex: 0 | 1;
    fetchEligible: (awardType: AwardType, playerIndex: 0 | 1) => Promise<EligibleRosterResponse | null>;
    setDuo: (awardType: AwardType, playerIndex: 0 | 1, sleeperPlayerId: string) => Promise<boolean>;
    saving: boolean;
    onDone: () => void;
    onClose: () => void;
}

export function DuoPickerModal({ awardType, playerIndex, fetchEligible, setDuo, saving, onDone, onClose }: DuoPickerModalProps) {
    const [data, setData] = useState<EligibleRosterResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [pickError, setPickError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchEligible(awardType, playerIndex).then(result => {
            if (!cancelled) {
                setData(result);
                setLoading(false);
            }
        });
        return () => { cancelled = true; };
    }, [awardType, playerIndex, fetchEligible]);

    async function handlePick(sleeperPlayerId: string) {
        setPickError(null);
        const ok = await setDuo(awardType, playerIndex, sleeperPlayerId);
        if (ok) {
            onDone();
        } else {
            setPickError('Could not save that pick - it may no longer be eligible. Try another.');
        }
    }

    const awardLabel = awardType === 'main' ? 'Main Award' : awardType === 'boom' ? 'Season of Boom' : 'Next Up Award';

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true">
            <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-lg border border-panel-line bg-panel p-5 sm:rounded-lg">
                <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-chalk">
                    {awardLabel}
                </h2>
                {data?.currentPlayer && (
                    <p className="mt-1 font-body text-sm text-chalk-dim">
                        Currently: <span className="text-chalk">{data.currentPlayer.name}</span> ({data.currentPlayer.position})
                    </p>
                )}

                {!loading && data && data.candidates.length > 0 && (
                    <p className="mt-3 font-mono text-xs uppercase tracking-widest text-chalk-dim">
                        {data.currentPlayer ? 'Eligible swaps' : 'Eligible players'}
                    </p>
                )}

                {!loading && data && data.candidates.length > 0 && data.situation === 'temporary' && (
                    <p className="mt-1 font-body text-xs italic text-chalk-dim">
                        Temporary - reverts automatically once the original player is healthy again.
                    </p>
                )}

                {!loading && data && data.candidates.length > 0 && data.situation === 'permanent' && (
                    <p className="mt-1 font-body text-xs italic text-chalk-dim">
                        Permanent swap - no auto-revert, and this uses one of your team&rsquo;s two for the season.
                    </p>
                )}

                {loading && (
                    <p className="mt-4 font-body text-sm text-chalk-dim">Loading your roster&hellip;</p>
                )}

                {!loading && data?.locked && data.permissionReason && data.candidates.length === 0 && (
                    <p className="mt-4 rounded border border-brick/50 bg-brick/10 px-3 py-2 font-body text-sm text-chalk">
                        {data.permissionReason}
                    </p>
                )}

                {!loading && data && !data.locked && data.candidates.length === 0 && (
                    <p className="mt-4 rounded border border-dashed border-panel-line px-3 py-3 font-body text-sm text-chalk-dim">
                        No eligible players on your roster right now
                        {data.otherSlotPlayer ? ` to pair with ${data.otherSlotPlayer.name}` : ''}.
                    </p>
                )}

                {!loading && data && data.candidates.length > 0 && (
                    <div className="mt-4 space-y-4">
                        {groupByPosition(data.candidates).map(([position, group]) => (
                            <div key={position}>
                                <p className="mb-1.5 font-mono text-xs uppercase tracking-widest text-bell">
                                    {position}
                                </p>
                                <div className="space-y-1.5">
                                    {group.map(c => (
                                        <button
                                            key={c.sleeperPlayerId}
                                            onClick={() => handlePick(c.sleeperPlayerId)}
                                            disabled={saving}
                                            className="flex w-full items-center justify-between rounded border border-panel-line bg-field/40 px-3 py-2 text-left disabled:opacity-50"
                                        >
                                            <span className="font-body text-sm text-chalk">{c.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {pickError && (
                    <p className="mt-3 rounded border border-brick/50 bg-brick/10 px-3 py-2 font-body text-sm text-chalk">
                        {pickError}
                    </p>
                )}

                <button
                    onClick={onClose}
                    className="mt-4 w-full rounded border border-panel-line px-4 py-2 font-body text-sm text-chalk-dim"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
