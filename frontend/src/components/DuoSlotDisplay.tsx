import type { DuoRow, NFLGameInfo } from '../types';
import { PlayerGameInfo } from './PlayerGameInfo';

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
}

// Yellow -> orange -> red as severity increases. Out/IR/PUP share the same
// dot color (all mean "not playing"); Questionable/Doubtful are distinct
// shades since they're genuinely different levels of real uncertainty.
const INJURY_DOT_COLOR: Record<string, string> = {
    Questionable: 'bg-yellow-500',
    Doubtful: 'bg-orange-500',
    Out: 'bg-brick',
    IR: 'bg-brick',
    PUP: 'bg-brick'
};

export function DuoSlotDisplay({ slot, onEdit, isBye, gameInfo, onViewPlayerNews }: DuoSlotDisplayProps) {
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
        </div>
    );
}
