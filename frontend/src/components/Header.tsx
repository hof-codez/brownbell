import type { Season } from '../types';

export function Header({ season }: { season: Season | null }) {
  return (
    <header className="border-b border-panel-line bg-panel px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <p className="font-mono text-xs uppercase tracking-widest text-bell">Dynasty Side Awards</p>
        <h1 className="mt-1 font-display text-5xl font-extrabold uppercase tracking-tight text-chalk">
          Brown Bell <span className="text-bell">&amp;</span> Next Up
        </h1>
        {season && (
          <p className="mt-2 font-body text-sm text-chalk-dim">
            {season.year} season &middot; Week {season.current_week}
          </p>
        )}
      </div>
    </header>
  );
}
