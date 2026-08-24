import { useEffect, useState } from 'react';
import type { AwardType, EligibleRosterResponse } from '../types';

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

    const awardLabel = awardType === 'main' ? 'Main Award' : 'Next Up Award';

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

                {loading && (
                    <p className="mt-4 font-body text-sm text-chalk-dim">Loading your roster&hellip;</p>
                )}

                {!loading && data?.locked && (
                    <p className="mt-4 rounded border border-brick/50 bg-brick/10 px-3 py-2 font-body text-sm text-chalk">
                        This slot is locked - that player&rsquo;s game has already started this week. It&rsquo;ll be swappable again next week.
                    </p>
                )}

                {!loading && data && !data.locked && data.candidates.length === 0 && (
                    <p className="mt-4 rounded border border-dashed border-panel-line px-3 py-3 font-body text-sm text-chalk-dim">
                        No eligible players on your roster right now
                        {data.otherSlotPlayer ? ` to pair with ${data.otherSlotPlayer.name}` : ''}.
                    </p>
                )}

                {!loading && data && !data.locked && data.candidates.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                        {data.candidates.map(c => (
                            <button
                                key={c.sleeperPlayerId}
                                onClick={() => handlePick(c.sleeperPlayerId)}
                                disabled={saving}
                                className="flex w-full items-center justify-between rounded border border-panel-line bg-field/40 px-3 py-2 text-left disabled:opacity-50"
                            >
                                <span className="font-body text-sm text-chalk">{c.name}</span>
                                <span className="font-mono text-xs uppercase tracking-wide text-bell">{c.position}</span>
                            </button>
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
