import type { TeamWithDuos, AwardType } from '../types';
import { BellIcon, SproutIcon, BoltIcon } from './icons';
import { DuoSlotDisplay } from './DuoSlotDisplay';
import { duoNameKey } from '../hooks/useDuoNames';

interface TeamCardProps {
    teamWithDuos: TeamWithDuos;
    onEditSlot?: (awardType: AwardType, playerIndex: 0 | 1) => void;
    byePlayerIds?: Set<string>;
    duoNames?: Map<string, string>;
    onNameDuo?: (awardType: AwardType) => void;
    /** Only passed for the owner's own card - matches onNameDuo's visibility pattern. */
    onCustomize?: () => void;
}

export function TeamCard({ teamWithDuos, onEditSlot, byePlayerIds, duoNames, onNameDuo, onCustomize }: TeamCardProps) {
    const { team, main, nextup, boom } = teamWithDuos;

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
        <article className="relative overflow-hidden rounded-lg border border-panel-line bg-panel p-5">
            {team.background_image_url && (
                <>
                    <div
                        className="absolute inset-0"
                        style={{
                            backgroundImage: `url(${team.background_image_url})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                            opacity: team.background_opacity
                        }}
                        aria-hidden="true"
                    />
                    {/* Fixed readability scrim - independent of the owner's chosen
                        opacity, so a busy or high-contrast image at full strength
                        can never make the card's text unreadable for anyone. */}
                    <div className="absolute inset-0 bg-panel/70" aria-hidden="true" />
                </>
            )}

            <div className="relative z-10">
                <div className="flex items-start justify-between gap-2">
                    <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-chalk">
                        {team.display_name}
                    </h2>
                    {onCustomize && (
                        <button onClick={onCustomize} className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-bell">
                            Customize
                        </button>
                    )}
                </div>
                <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-chalk-dim">
                    {team.permanent_swaps_used}/2 permanent swaps used
                    {!team.manual_privilege && (
                        <span className="ml-1.5 text-brick">&middot; manual picks locked, auto-fill only</span>
                    )}
                </p>

                <div className="mt-4 space-y-4">
                    <section aria-labelledby={`main-${team.id}`}>
                        {renderAwardHeader('main', BellIcon, 'Brown Bell', main)}
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

                    <section aria-labelledby={`boom-${team.id}`}>
                        {renderAwardHeader('boom', BoltIcon, 'Season of Boom', boom)}
                        <div className="space-y-1.5">
                            <DuoSlotDisplay slot={boom[0]} onEdit={onEditSlot ? () => onEditSlot('boom', 0) : undefined} isBye={isBye(boom[0])} />
                            <DuoSlotDisplay slot={boom[1]} onEdit={onEditSlot ? () => onEditSlot('boom', 1) : undefined} isBye={isBye(boom[1])} />
                        </div>
                    </section>
                </div>
            </div>
        </article>
    );
}
