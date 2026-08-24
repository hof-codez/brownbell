import type { DuoRow } from '../types';

interface DuoSlotDisplayProps {
    slot: DuoRow | null;
    onEdit?: () => void;
}

export function DuoSlotDisplay({ slot, onEdit }: DuoSlotDisplayProps) {
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
            <span className="font-body text-sm text-chalk">{slot.player_name}</span>
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
