import { useState } from 'react';
import { useSeasonData } from './hooks/useSeasonData';
import { useTeamClaim } from './hooks/useTeamClaim';
import { useDuoPicker } from './hooks/useDuoPicker';
import { Header } from './components/Header';
import { TeamCard } from './components/TeamCard';
import { ClaimStatusBar } from './components/ClaimStatusBar';
import { ClaimTeamModal } from './components/ClaimTeamModal';
import { DuoPickerModal } from './components/DuoPickerModal';
import type { AwardType } from './types';

export default function App() {
  const { loading, error, season, teams, refetch } = useSeasonData();
  const { status, claimedTeam, claiming, claimError, claim, forget } = useTeamClaim();
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{ awardType: AwardType; playerIndex: 0 | 1 } | null>(null);

  const myTeam = claimedTeam ? teams.find(t => t.team.id === claimedTeam.teamId) ?? null : null;
  const otherTeams = myTeam ? teams.filter(t => t.team.id !== myTeam.team.id) : teams;

  // Only constructed when there's a claimed team - the hook needs a real
  // teamId/deviceToken, and there's nothing to edit without one.
  const picker = useDuoPicker(claimedTeam?.teamId ?? '', claimedTeam?.deviceToken ?? '');

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

        {!loading && !error && myTeam && (
          <section className="mb-8">
            <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-bell">
              Your Team
            </h2>
            <div className="max-w-sm">
              <TeamCard
                teamWithDuos={myTeam}
                onEditSlot={(awardType, playerIndex) => setEditingSlot({ awardType, playerIndex })}
              />
            </div>
          </section>
        )}

        {!loading && !error && otherTeams.length > 0 && (
          <>
            {myTeam && (
              <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-chalk-dim">
                All Teams
              </h2>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {otherTeams.map((teamWithDuos) => (
                <TeamCard key={teamWithDuos.team.id} teamWithDuos={teamWithDuos} />
              ))}
            </div>
          </>
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

      {editingSlot && myTeam && (
        <DuoPickerModal
          awardType={editingSlot.awardType}
          playerIndex={editingSlot.playerIndex}
          fetchEligible={picker.fetchEligible}
          setDuo={picker.setDuo}
          saving={picker.saving}
          onDone={() => {
            setEditingSlot(null);
            refetch();
          }}
          onClose={() => setEditingSlot(null)}
        />
      )}
    </div>
  );
}
