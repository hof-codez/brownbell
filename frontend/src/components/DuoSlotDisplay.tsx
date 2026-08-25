import type { DuoRow } from '../types';

interface DuoSlotDisplayProps {
    slot: DuoRow | null;
    onEdit?: () => void;
    /** True if this player is on their NFL bye this week - live check, only
     * meaningful for the CURRENT week (not shown for other weeks). */
    isBye?: boolean;
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

    const dotColor = slot.injury_status ? INJURY_DOT_COLOR[slot.injury_status] : undefined;

    return (
        <div className="flex items-center justify-between rounded border border-panel-line bg-field/40 px-3 py-2">
            <span className="flex items-center gap-2 font-body text-sm text-chalk">
                {dotColor && (
                    <span
                        className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`}
                        title={slot.injury_status ?? undefined}
                        aria-label={slot.injury_status ? `Injury status: ${slot.injury_status}` : undefined}
                    />
                )}
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
