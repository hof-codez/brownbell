import { useState } from 'react';
import { useSeasonData } from './hooks/useSeasonData';
import { useTeamClaim } from './hooks/useTeamClaim';
import { Header } from './components/Header';
import { TeamCard } from './components/TeamCard';
import { ClaimStatusBar } from './components/ClaimStatusBar';
import { ClaimTeamModal } from './components/ClaimTeamModal';

export default function App() {
  const { loading, error, season, teams } = useSeasonData();
  const { status, claimedTeam, claiming, claimError, claim, forget } = useTeamClaim();
  const [showClaimModal, setShowClaimModal] = useState(false);

  return (
    <div className="min-h-screen bg-field">
      <Header season={season} />

      <ClaimStatusBar
        status={status}
        claimedTeamName={claimedTeam?.teamName ?? null}
        onOpenClaim={() => setShowClaimModal(true)}
        onForget={forget}
      />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
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

      {showClaimModal && (
        <ClaimTeamModal
          teams={teams.map(t => t.team)}
          claiming={claiming}
          claimError={claimError}
          onClaim={claim}
          onClose={() => setShowClaimModal(false)}
        />
      )}
    </div>
  );
}
