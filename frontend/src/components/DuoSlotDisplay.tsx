import type { DuoRow } from '../types';

export function DuoSlotDisplay({ slot }: { slot: DuoRow | null }) {
  if (!slot) {
    return (
      <div className="flex items-center justify-between rounded border border-dashed border-panel-line px-3 py-2">
        <span className="font-body text-sm italic text-chalk-dim">Not set yet</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between rounded border border-panel-line bg-field/40 px-3 py-2">
      <span className="font-body text-sm text-chalk">{slot.player_name}</span>
      <span className="font-mono text-xs uppercase tracking-wide text-bell">{slot.player_position}</span>
    </div>
  );
}
