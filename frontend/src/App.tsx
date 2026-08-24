import { useSeasonData } from './hooks/useSeasonData';
import { Header } from './components/Header';
import { TeamCard } from './components/TeamCard';

export default function App() {
  const { loading, error, season, teams } = useSeasonData();

  return (
    <div className="min-h-screen bg-field">
      <Header season={season} />

      <main className="mx-auto max-w-5xl px-6 py-8">
        {loading && (
          <p className="font-body text-sm text-chalk-dim">Loading teams&hellip;</p>
        )}

        {!loading && error && (
          <div className="rounded border border-brick/50 bg-brick/10 px-4 py-3">
            <p className="font-body text-sm text-chalk">
              Couldn&rsquo;t load the season: {error}
            </p>
          </div>
        )}

        {!loading && !error && teams.length === 0 && (
          <div className="rounded border border-dashed border-panel-line px-4 py-6 text-center">
            <p className="font-body text-sm text-chalk-dim">
              No teams found for the current season yet.
            </p>
          </div>
        )}

        {!loading && !error && teams.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((teamWithDuos) => (
              <TeamCard key={teamWithDuos.team.id} teamWithDuos={teamWithDuos} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
