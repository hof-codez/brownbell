import type { TeamWithDuos, AwardType } from '../types';
import { BellIcon, SproutIcon } from './icons';
import { DuoSlotDisplay } from './DuoSlotDisplay';

interface TeamCardProps {
    teamWithDuos: TeamWithDuos;
    onEditSlot?: (awardType: AwardType, playerIndex: 0 | 1) => void;
}

export function TeamCard({ teamWithDuos, onEditSlot }: TeamCardProps) {
    const { team, main, nextup } = teamWithDuos;

    return (
        <article className="rounded-lg border border-panel-line bg-panel p-5">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-chalk">
                {team.display_name}
            </h2>

            <div className="mt-4 space-y-4">
                <section aria-labelledby={`main-${team.id}`}>
                    <div className="mb-2 flex items-center gap-2">
                        <BellIcon className="h-4 w-4 text-bell" />
                        <h3 id={`main-${team.id}`} className="font-mono text-xs uppercase tracking-widest text-chalk-dim">
                            Main Award
                        </h3>
                    </div>
                    <div className="space-y-1.5">
                        <DuoSlotDisplay slot={main[0]} onEdit={onEditSlot ? () => onEditSlot('main', 0) : undefined} />
                        <DuoSlotDisplay slot={main[1]} onEdit={onEditSlot ? () => onEditSlot('main', 1) : undefined} />
                    </div>
                </section>

                <section aria-labelledby={`nextup-${team.id}`}>
                    <div className="mb-2 flex items-center gap-2">
                        <SproutIcon className="h-4 w-4 text-bell" />
                        <h3 id={`nextup-${team.id}`} className="font-mono text-xs uppercase tracking-widest text-chalk-dim">
                            Next Up Award
                        </h3>
                    </div>
                    <div className="space-y-1.5">
                        <DuoSlotDisplay slot={nextup[0]} onEdit={onEditSlot ? () => onEditSlot('nextup', 0) : undefined} />
                        <DuoSlotDisplay slot={nextup[1]} onEdit={onEditSlot ? () => onEditSlot('nextup', 1) : undefined} />
                    </div>
                </section>
            </div>
        </article>
    );
}
