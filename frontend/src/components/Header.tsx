import type { Season } from '../types';
import { getCurrentWeek } from '../lib/displayWeek';
import { calculatorHref } from '../lib/calculatorLink';
import { loadCachedClaim } from '../lib/deviceStorage';

export function Header({ season }: { season: Season | null }) {
  return (
    <header className="border-b border-panel-line bg-panel px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-xs uppercase tracking-widest text-bell">Dynasty Side Awards</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold uppercase tracking-tight text-chalk sm:text-4xl md:text-5xl">
          Brown Bell <span className="text-bell">&amp;</span> Next Up
        </h1>
        {season && (
          <p className="mt-2 font-body text-sm text-chalk-dim">
            {season.year} season &middot; Week {getCurrentWeek(season.current_week)}
          </p>
        )}
        {loadCachedClaim() && (
          <a
            href={calculatorHref()}
            className="mt-3 inline-block rounded border border-bell/60 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-bell"
          >
            Trade values &rarr;
          </a>
        )}
      </div>
    </header>
  );
}
