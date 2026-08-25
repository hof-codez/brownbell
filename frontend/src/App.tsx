import { useState } from 'react';
import { useSeasonData } from './hooks/useSeasonData';
import { useTeamClaim } from './hooks/useTeamClaim';
import { useDuoPicker } from './hooks/useDuoPicker';
import { useLockCountdown } from './hooks/useLockCountdown';
import { useCurrentWeekByeStatus } from './hooks/useCurrentWeekByeStatus';
import { Header } from './components/Header';
import { ClaimStatusBar } from './components/ClaimStatusBar';
import { ClaimTeamModal } from './components/ClaimTeamModal';
import { DuoPickerModal } from './components/DuoPickerModal';
import { CountdownBanner } from './components/CountdownBanner';
import { Tabs } from './components/Tabs';
import { TeamsView } from './components/TeamsView';
import { RulesPage } from './components/RulesPage';
import { LeagueTab } from './components/LeagueTab';
import { BonusTab } from './components/BonusTab';
import { HistoryTab } from './components/HistoryTab';
import type { AwardType } from './types';

const TABS = [
  { id: 'teams', label: 'Teams' },
  { id: 'league', label: 'League' },
  { id: 'bonus', label: 'Bonus' },
  { id: 'history', label: 'History' },
  { id: 'rules', label: 'Rules' }
];

export default function App() {
  const { loading, error, season, teams, refetch } = useSeasonData();
  const { status, claimedTeam, claiming, claimError, claim, forget } = useTeamClaim();
  const { lockTime } = useLockCountdown(season?.id ?? null);
  const byePlayerIds = useCurrentWeekByeStatus(season);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{ awardType: AwardType; playerIndex: 0 | 1 } | null>(null);
  const [activeTab, setActiveTab] = useState('teams');
  // Set alongside switching to the Rules tab so it knows which section to
  // scroll to - cleared once RulesPage has consumed it via its own effect,
  // but simplest to just always pass the latest value down.
  const [rulesScrollTarget, setRulesScrollTarget] = useState<string | null>(null);

  const myTeam = claimedTeam ? teams.find(t => t.team.id === claimedTeam.teamId) ?? null : null;
  const otherTeams = myTeam ? teams.filter(t => t.team.id !== myTeam.team.id) : teams;

  // Only meaningful once there's a claimed team - the hook needs a real
  // teamId/deviceToken, and there's nothing to edit without one.
  const picker = useDuoPicker(claimedTeam?.teamId ?? '', claimedTeam?.deviceToken ?? '');

  function goToRulesSection(id: string) {
    setRulesScrollTarget(id);
    setActiveTab('rules');
  }

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
            byePlayerIds={byePlayerIds}
          />
        )}

        {activeTab === 'league' && (
          <LeagueTab teams={teams} myTeamId={claimedTeam?.teamId ?? null} />
        )}

        {activeTab === 'bonus' && (
          <BonusTab
            teams={teams}
            myTeamId={claimedTeam?.teamId ?? null}
            onLearnMore={() => goToRulesSection('bonus-matchups-rule')}
          />
        )}

        {activeTab === 'history' && (
          <HistoryTab teams={teams.map(t => t.team)} />
        )}

        {activeTab === 'rules' && <RulesPage scrollToId={activeTab === 'rules' ? rulesScrollTarget : null} />}
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
