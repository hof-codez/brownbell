import type { DuoRow, NFLGameInfo } from '../types';
import type { StandbyInfo } from '../hooks/useStandbyStatus';
import { PlayerGameInfo } from './PlayerGameInfo';
import { INJURY_DOT_COLOR } from '../lib/injuryDotColor';

interface DuoSlotDisplayProps {
    slot: DuoRow | null;
    onEdit?: () => void;
    /** True if this player is on their NFL bye this week - live check, only
     * meaningful for the CURRENT week (not shown for other weeks). */
    isBye?: boolean;
    /** This player's next game info (opponent, kickoff time) - undefined
     * if not yet known. */
    gameInfo?: NFLGameInfo;
    /** Called when the player's name is clicked. Owned by a single shared
     * parent (see App.tsx) rather than local state here, so that opening
     * a second player's news always replaces whichever one was already
     * showing instead of stacking multiple modals on top of each other -
     * many DuoSlotDisplay instances render at once on the Teams tab. */
    onViewPlayerNews?: (playerName: string, sleeperPlayerId: string | null) => void;
    /** Opens the standby picker - only ever passed a real handler by
     * TeamCard when this specific slot's current player's game is
     * genuinely the week's last one and hasn't started yet (see
     * TeamCard.tsx's getStandbyHandler); undefined otherwise, which
     * simply hides the option here rather than needing its own
     * eligibility logic duplicated in this component too. */
    onSetStandby?: () => void;
    /** The standby already set for this slot, if any - shown instead of
     * the plain "Set a Standby" prompt once an owner has actually picked
     * one, so they can see who without having to reopen the picker. */
    currentStandby?: StandbyInfo;
}

export function DuoSlotDisplay({ slot, onEdit, isBye, gameInfo, onViewPlayerNews, onSetStandby, currentStandby }: DuoSlotDisplayProps) {
    if (!slot) {
        return (
            <div className="flex items-center justify-between rounded border border-dashed border-panel-line px-3 py-2">
                <span className="font-body text-sm italic text-chalk-dim">Not set yet</span>
                {onEdit && (
                    <button onClick={onEdit} className="font-mono text-xs uppercase tracking-widest text-bell">
                        Set
                    </button>
                )}
            </div>
        );
    }

    // A departed player's injury status is stale/irrelevant - never shown
    // alongside the "no longer on roster" indicator below.
    const dotColor = !slot.player_departed && slot.injury_status ? INJURY_DOT_COLOR[slot.injury_status] : undefined;

    // True whenever the currently-set player isn't the original, frozen
    // pick for this slot - i.e. a swap (auto or owner-made) has already
    // happened. Mirrors the same underlying fact the History tab already
    // shows via its own SUB/AUTO-SUB badges, just surfaced here too so an
    // owner glancing at their Teams tab can see it without switching tabs.
    // Never shown for a departed slot - that has its own, more urgent
    // indicator below instead.
    const isSubstituted = !slot.player_departed && !!slot.original_sleeper_player_id && slot.original_sleeper_player_id !== slot.sleeper_player_id;
    // True whenever the active substitution for this slot was specifically
    // a standby stepping in (Monday Night player ruled out, pre-committed
    // choice activates) - neither an owner manually swapping mid-week nor
    // the normal kickoff-time auto-sub, so it gets its own label rather
    // than being lumped into either. Matches the same reason-text prefix
    // the History tab's STANDBY badge already keys off, so both places
    // agree on what counts.
    const isStandbyActivation = !slot.player_departed && !!slot.current_sub_reason?.startsWith('Standby activated');
    // 'admin' reads as "Sub" here too - both it and 'owner' are "a human
    // set this," as opposed to 'auto'. The full owner/admin distinction
    // stays visible in the History tab; this is just the Teams tab's
    // at-a-glance version. Falls back to "Sub" if the source is
    // ever unknown (e.g. the substitutions fetch failed), rather than
    // showing nothing for a slot that's clearly been substituted.
    const subLabel = isStandbyActivation ? 'Standby' : slot.current_sub_source === 'auto' ? 'Auto-sub' : 'Sub';

    return (
        <div className={`rounded border px-3 py-2 ${slot.player_departed ? 'border-brick/50 bg-brick/10' : 'border-panel-line bg-field/40'}`}>
            <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-body text-sm text-chalk">
                    {dotColor && (
                        <span
                            className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`}
                            title={slot.injury_status ?? undefined}
                            aria-label={slot.injury_status ? `Injury status: ${slot.injury_status}` : undefined}
                        />
                    )}
                    <button
                        onClick={() => onViewPlayerNews?.(slot.player_name, slot.sleeper_player_id)}
                        className={`underline decoration-dotted underline-offset-2 ${slot.player_departed ? 'text-chalk-dim decoration-chalk-dim line-through' : 'decoration-chalk-dim'}`}
                    >
                        {slot.player_name}
                    </button>
                    {isBye && !slot.player_departed && (
                        <span className="rounded bg-brick/20 px-1 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-brick">
                            Bye
                        </span>
                    )}
                    {isSubstituted && (
                        <span
                            className="rounded bg-panel-line px-1 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-chalk-dim"
                            title={
                                subLabel === 'Standby'
                                    ? 'A pre-committed standby stepped in for this slot'
                                    : subLabel === 'Auto-sub'
                                        ? 'The system automatically subbed this player in'
                                        : 'This player was subbed in for the original pick'
                            }
                        >
                            {subLabel}
                        </span>
                    )}
                </span>
                <div className="flex items-center gap-3">
                    <span className="font-mono text-xs uppercase tracking-wide text-bell">{slot.player_position}</span>
                    {onEdit && (
                        <button onClick={onEdit} className="font-mono text-xs uppercase tracking-widest text-chalk-dim">
                            Change
                        </button>
                    )}
                </div>
            </div>
            {slot.player_departed ? (
                <p className="mt-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-brick">
                    No longer on this roster &mdash; pick a replacement
                </p>
            ) : gameInfo && (
                <div className="mt-0.5">
                    <PlayerGameInfo gameInfo={gameInfo} />
                </div>
            )}
            {typeof slot.ir_pup_weeks_until_permanent === 'number' && (
                <p
                    className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-yellow-500"
                    title="This award's one permanent swap is used automatically once the countdown reaches 0 - the current player becomes the new pick going forward, no take-backs."
                >
                    Becomes permanent in {slot.ir_pup_weeks_until_permanent} week{slot.ir_pup_weeks_until_permanent === 1 ? '' : 's'}
                </p>
            )}
            {currentStandby && (
                // Shown whenever an un-consumed standby exists for this slot,
                // regardless of onSetStandby - that prop only gates whether
                // it's still EDITABLE (kickoff hasn't happened), not whether
                // it's still true that one was set. Without this split, the
                // instant a game started, any trace of a standby ever having
                // existed disappeared from the UI entirely - confirmed as a
                // real gap: an owner had no way to tell, after the fact,
                // whether a pre-committed standby simply never got a chance
                // to matter (their original player played fine) or should
                // have activated but didn't. A consumed standby stops
                // appearing here at all once it's used - useStandbyStatus
                // only fetches un-consumed ones - since the slot's own "Sub"
                // badge above already communicates that a swap happened,
                // making a redundant "Standby: X" line beneath it
                // unnecessary once that's the case.
                onSetStandby ? (
                    <button
                        onClick={onSetStandby}
                        className="mt-1 flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-chalk-dim"
                        title="No eligible replacement exists on your roster for this player right now - if they're ruled out, this pre-picked standby steps in automatically. Tap to change."
                    >
                        <span className="text-bell">Standby:</span> {currentStandby.playerName} ({currentStandby.playerPosition})
                    </button>
                ) : (
                    <p
                        className="mt-1 flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-chalk-dim"
                        title="This standby was set before kickoff and can no longer be changed."
                    >
                        <span className="text-bell">Standby:</span> {currentStandby.playerName} ({currentStandby.playerPosition})
                    </p>
                )
            )}
            {!currentStandby && onSetStandby && (
                <button
                    onClick={onSetStandby}
                    className="mt-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-bell"
                    title="No eligible replacement exists on your roster for this player right now - if they're ruled out, a pre-picked standby can step in automatically"
                >
                    Set a Standby &rarr;
                </button>
            )}
        </div>
    );
}
