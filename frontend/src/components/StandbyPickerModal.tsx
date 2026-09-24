import { useEffect, useState } from 'react';
import type { AwardType, EligibleRosterResponse, EligibleCandidate, NFLGameInfo } from '../types';
import { PlayerGameInfo } from './PlayerGameInfo';
import { INJURY_DOT_COLOR } from '../lib/injuryDotColor';

// Same ordering/grouping approach as DuoPickerModal - kept as a separate
// copy rather than a shared import, since the two modals' surrounding
// copy differs enough (this one is about a hypothetical future
// activation, not a real swap happening right now) that merging them
// into one component would mean threading a mode flag through most of
// the JSX below for little real benefit.
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

interface StandbyPickerModalProps {
    awardType: AwardType;
    playerIndex: 0 | 1;
    /** The current (Monday Night) player this standby would cover for -
     * shown for context, since this modal never appears without one. */
    currentPlayerName: string;
    /** Reuses the exact same read-only eligibility computation as the
     * normal duo picker (get-eligible-roster) - a candidate's own game
     * having already started is checked there identically to what a
     * standby actually needs, so there's no separate eligibility
     * endpoint for this. */
    fetchEligible: (awardType: AwardType, playerIndex: 0 | 1) => Promise<EligibleRosterResponse | null>;
    setStandby: (awardType: AwardType, playerIndex: 0 | 1, sleeperPlayerId: string) => Promise<{ success: boolean; error?: string }>;
    saving: boolean;
    getGameInfo?: (nflTeam: string | null) => NFLGameInfo | undefined;
    onDone: () => void;
    onClose: () => void;
}

export function StandbyPickerModal({ awardType, playerIndex, currentPlayerName, fetchEligible, setStandby, saving, getGameInfo, onDone, onClose }: StandbyPickerModalProps) {
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
        const result = await setStandby(awardType, playerIndex, sleeperPlayerId);
        if (result.success) {
            onDone();
        } else {
            setPickError(result.error || 'Could not save that standby - try another.');
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true">
            <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-lg border border-panel-line bg-panel p-5 sm:rounded-lg">
                <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-chalk">
                    Set a Standby
                </h2>
                <p className="mt-1 font-body text-sm text-chalk-dim">
                    If <span className="text-chalk">{currentPlayerName}</span> is ruled out before kickoff, this player steps in automatically.
                </p>
                <p className="mt-2 font-body text-xs italic text-chalk-dim">
                    This only exists because no eligible replacement currently exists on your roster for {currentPlayerName} - normally, the usual substitution system already covers an injury. Pick before either game starts; the choice locks once one does.
                </p>

                {!loading && data && data.candidates.length > 0 && (
                    <p className="mt-3 font-mono text-xs uppercase tracking-widest text-chalk-dim">
                        Eligible standbys
                    </p>
                )}

                {loading && (
                    <p className="mt-4 font-body text-sm text-chalk-dim">Loading your roster&hellip;</p>
                )}

                {!loading && data && data.candidates.length === 0 && (
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
                                            disabled={saving || !!c.ineligibleReason}
                                            className={`flex w-full items-center justify-between rounded border px-3 py-2 text-left disabled:opacity-50 ${
                                                c.ineligibleReason ? 'border-brick/50 bg-brick/10' : 'border-panel-line bg-field/40'
                                            }`}
                                        >
                                            <span className="flex flex-col">
                                                <span className="flex items-center gap-1.5">
                                                    {!c.ineligibleReason && c.injuryStatus && (
                                                        <span
                                                            className={`h-2 w-2 shrink-0 rounded-full ${INJURY_DOT_COLOR[c.injuryStatus] || 'bg-chalk-dim'}`}
                                                            title={c.injuryStatus}
                                                            aria-label={`Injury status: ${c.injuryStatus}`}
                                                        />
                                                    )}
                                                    <span className={`font-body text-sm ${c.ineligibleReason ? 'text-chalk-dim line-through' : 'text-chalk'}`}>
                                                        {c.name}
                                                    </span>
                                                </span>
                                                {c.ineligibleReason ? (
                                                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-brick">
                                                        {c.ineligibleReason}
                                                    </span>
                                                ) : c.injuryStatus ? (
                                                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wide text-yellow-500">
                                                        {c.injuryStatus} - still eligible, but hasn&rsquo;t been cleared
                                                    </span>
                                                ) : (
                                                    <PlayerGameInfo gameInfo={getGameInfo?.(c.team)} />
                                                )}
                                            </span>
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
