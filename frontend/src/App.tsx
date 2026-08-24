import { useState } from 'react';
import { useSeasonData } from './hooks/useSeasonData';
import { useTeamClaim } from './hooks/useTeamClaim';
import { useDuoPicker } from './hooks/useDuoPicker';
import { useLockCountdown } from './hooks/useLockCountdown';
import { Header } from './components/Header';
import { ClaimStatusBar } from './components/ClaimStatusBar';
import { ClaimTeamModal } from './components/ClaimTeamModal';
import { DuoPickerModal } from './components/DuoPickerModal';
import { CountdownBanner } from './components/CountdownBanner';
import { Tabs } from './components/Tabs';
import { TeamsView } from './components/TeamsView';
import { RulesPage } from './components/RulesPage';
import { LeagueTab } from './components/LeagueTab';
import type { AwardType } from './types';

const TABS = [
  { id: 'teams', label: 'Teams' },
  { id: 'league', label: 'League' },
  { id: 'rules', label: 'Rules' }
];

export default function App() {
  const { loading, error, season, teams, refetch } = useSeasonData();
  const { status, claimedTeam, claiming, claimError, claim, forget } = useTeamClaim();
  const { lockTime } = useLockCountdown(season?.id ?? null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{ awardType: AwardType; playerIndex: 0 | 1 } | null>(null);
  const [activeTab, setActiveTab] = useState('teams');

  const myTeam = claimedTeam ? teams.find(t => t.team.id === claimedTeam.teamId) ?? null : null;
  const otherTeams = myTeam ? teams.filter(t => t.team.id !== myTeam.team.id) : teams;

  // Only meaningful once there's a claimed team - the hook needs a real
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

      <CountdownBanner lockTime={lockTime} />

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {activeTab === 'teams' && (
          <TeamsView
            loading={loading}
            error={error}
            myTeam={myTeam}
            otherTeams={otherTeams}
            onEditSlot={(awardType, playerIndex) => setEditingSlot({ awardType, playerIndex })}
          />
        )}

        {activeTab === 'league' && (
          <LeagueTab teams={teams} myTeamId={claimedTeam?.teamId ?? null} />
        )}

        {activeTab === 'rules' && <RulesPage />}
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
