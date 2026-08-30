import { useState } from 'react';
import type { TeamWithDuos, AwardType } from '../types';
import { BellIcon, SproutIcon, BoltIcon } from './icons';
import { DuoSlotDisplay } from './DuoSlotDisplay';
import { duoNameKey } from '../hooks/useDuoNames';

interface TeamCardProps {
    teamWithDuos: TeamWithDuos;
    onEditSlot?: (awardType: AwardType, playerIndex: 0 | 1) => void;
    byePlayerIds?: Set<string>;
    duoNames?: Map<string, string>;
    currentWeekScore?: number;
    onNameDuo?: (awardType: AwardType) => void;
    onCustomize?: () => void;
    /** Jumps to this team's filtered History view. Not scoped to the
     * owner's own card - useful for checking anyone's activity. */
    onViewHistory?: () => void;
    /** Other teams' cards start collapsed to a summary (name + score) with
     * a toggle to see the full breakdown - keeps the "All Teams" grid
     * scannable now that each card can hold three full award sections.
     * The owner's own card is never collapsible; omit this prop for it. */
    collapsible?: boolean;
}

export function TeamCard({ teamWithDuos, onEditSlot, byePlayerIds, duoNames, currentWeekScore, onNameDuo, onCustomize, onViewHistory, collapsible }: TeamCardProps) {
    const { team, main, nextup, boom } = teamWithDuos;
    const [expanded, setExpanded] = useState(!collapsible);

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
        <article
            className={`relative overflow-hidden rounded-lg border bg-panel p-5 ${team.accent_color ? '' : 'border-panel-line'}`}
            style={team.accent_color ? { borderColor: team.accent_color } : undefined}
        >
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
                    <div className="absolute inset-0 bg-panel/70" aria-hidden="true" />
                </>
            )}

            <div className="relative z-10">
                <div className="flex items-start justify-between gap-2">
                    <h2
                        className={`font-display text-2xl font-bold uppercase tracking-wide ${team.accent_color ? '' : 'text-chalk'}`}
                        style={team.accent_color ? { color: team.accent_color } : undefined}
                    >
                        {team.display_name}
                    </h2>
                    <div className="flex shrink-0 items-center gap-2">
                        {onViewHistory && (
                            <button onClick={onViewHistory} className="font-mono text-[10px] uppercase tracking-widest text-chalk-dim">
                                History
                            </button>
                        )}
                        {onCustomize && (
                            <button onClick={onCustomize} className="font-mono text-[10px] uppercase tracking-widest text-bell">
                                Customize
                            </button>
                        )}
                    </div>
                </div>
                {currentWeekScore !== undefined && (
                    <p className="mt-0.5 font-mono text-xs text-chalk-dim">
                        This week &middot; <span className="text-chalk">{currentWeekScore.toFixed(1)} pts</span>
                    </p>
                )}

                {expanded && (
                    <p className="mt-1 font-mono text-[11px] uppercase tracking-wide text-chalk-dim">
                        {team.permanent_swaps_used}/2 permanent swaps used
                        {!team.manual_privilege && (
                            <span className="ml-1.5 text-brick">&middot; manual picks locked, auto-fill only</span>
                        )}
                    </p>
                )}

                {expanded ? (
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
                ) : null}

                {collapsible && (
                    <button
                        onClick={() => setExpanded(e => !e)}
                        className="mt-3 w-full rounded border border-panel-line py-1 font-mono text-[10px] uppercase tracking-widest text-chalk-dim"
                    >
                        {expanded ? 'Show less \u25B4' : 'Show details \u25BE'}
                    </button>
                )}
            </div>
        </article>
    );
}
