import type { TeamWithDuos, AwardType } from '../types';
import { BellIcon, SproutIcon } from './icons';
import { DuoSlotDisplay } from './DuoSlotDisplay';
import { duoNameKey } from '../hooks/useDuoNames';

interface TeamCardProps {
    teamWithDuos: TeamWithDuos;
    onEditSlot?: (awardType: AwardType, playerIndex: 0 | 1) => void;
    /** Sleeper player IDs on bye this week - see useCurrentWeekByeStatus. */
    byePlayerIds?: Set<string>;
    /** All duo nicknames, keyed by duoNameKey(teamId, awardType) - shown to everyone. */
    duoNames?: Map<string, string>;
    /** Opens the naming modal - only passed for the owner's own card. */
    onNameDuo?: (awardType: AwardType) => void;
}

export function TeamCard({ teamWithDuos, onEditSlot, byePlayerIds, duoNames, onNameDuo }: TeamCardProps) {
    const { team, main, nextup } = teamWithDuos;

    function isBye(slot: TeamWithDuos['main'][number]): boolean {
        return !!slot?.sleeper_player_id && !!byePlayerIds?.has(slot.sleeper_player_id);
    }

    function renderAwardHeader(awardType: AwardType, Icon: typeof BellIcon, label: string, slots: TeamWithDuos['main']) {
        const name = duoNames?.get(duoNameKey(team.id, awardType));
        const bothSet = !!slots[0] && !!slots[1];
        return (
            <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-bell" />
                    <h3 className="font-mono text-xs uppercase tracking-widest text-chalk-dim">{label}</h3>
                    {name && <span className="font-body text-sm italic text-chalk">&ldquo;{name}&rdquo;</span>}
                </div>
                {onNameDuo && bothSet && (
                    <button onClick={() => onNameDuo(awardType)} className="font-mono text-[10px] uppercase tracking-widest text-bell">
                        {name ? 'Rename' : 'Name it'}
                    </button>
                )}
            </div>
        );
    }

    return (
        <article className="rounded-lg border border-panel-line bg-panel p-5">
            <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-chalk">
                {team.display_name}
            </h2>

            <div className="mt-4 space-y-4">
                <section aria-labelledby={`main-${team.id}`}>
                    {renderAwardHeader('main', BellIcon, 'Main Award', main)}
                    <div className="space-y-1.5">
                        <DuoSlotDisplay slot={main[0]} onEdit={onEditSlot ? () => onEditSlot('main', 0) : undefined} isBye={isBye(main[0])} />
                        <DuoSlotDisplay slot={main[1]} onEdit={onEditSlot ? () => onEditSlot('main', 1) : undefined} isBye={isBye(main[1])} />
                    </div>
                </section>

                <section aria-labelledby={`nextup-${team.id}`}>
                    {renderAwardHeader('nextup', SproutIcon, 'Next Up Award', nextup)}
                    <div className="space-y-1.5">
                        <DuoSlotDisplay slot={nextup[0]} onEdit={onEditSlot ? () => onEditSlot('nextup', 0) : undefined} isBye={isBye(nextup[0])} />
                        <DuoSlotDisplay slot={nextup[1]} onEdit={onEditSlot ? () => onEditSlot('nextup', 1) : undefined} isBye={isBye(nextup[1])} />
                    </div>
                </section>
            </div>
        </article>
    );
}
