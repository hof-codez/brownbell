import type { TeamWithDuos } from '../types';
import { BellIcon, SproutIcon } from './icons';
import { DuoSlotDisplay } from './DuoSlotDisplay';

export function TeamCard({ teamWithDuos }: { teamWithDuos: TeamWithDuos }) {
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
            <DuoSlotDisplay slot={main[0]} />
            <DuoSlotDisplay slot={main[1]} />
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
            <DuoSlotDisplay slot={nextup[0]} />
            <DuoSlotDisplay slot={nextup[1]} />
          </div>
        </section>
      </div>
    </article>
  );
}
