import type { DuoRow } from '../types';

interface DuoSlotDisplayProps {
    slot: DuoRow | null;
    onEdit?: () => void;
    /** True if this player is on their NFL bye this week - live check, only
     * meaningful for the CURRENT week (not shown for other weeks). */
    isBye?: boolean;
}

export function DuoSlotDisplay({ slot, onEdit, isBye }: DuoSlotDisplayProps) {
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

    return (
        <div className="flex items-center justify-between rounded border border-panel-line bg-field/40 px-3 py-2">
            <span className="flex items-center gap-2 font-body text-sm text-chalk">
                {slot.player_name}
                {isBye && (
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
    );
}
