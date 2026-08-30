import { useState } from 'react';
import { useSeasonData } from './hooks/useSeasonData';
import { useTeamClaim } from './hooks/useTeamClaim';
import { useDuoPicker } from './hooks/useDuoPicker';
import { useLockCountdown } from './hooks/useLockCountdown';
import { useCurrentWeekByeStatus } from './hooks/useCurrentWeekByeStatus';
import { useDuoNames, duoNameKey } from './hooks/useDuoNames';
import { useDuoNaming } from './hooks/useDuoNaming';
import { useTeamBackground } from './hooks/useTeamBackground';
import { Header } from './components/Header';
import { ClaimStatusBar } from './components/ClaimStatusBar';
import { ClaimTeamModal } from './components/ClaimTeamModal';
import { DuoPickerModal } from './components/DuoPickerModal';
import { DuoNameModal } from './components/DuoNameModal';
import { TeamBackgroundModal } from './components/TeamBackgroundModal';
import { CountdownBanner } from './components/CountdownBanner';
import { Tabs } from './components/Tabs';
import { TeamsView } from './components/TeamsView';
import { LeagueTab } from './components/LeagueTab';
import { ShowdownTab } from './components/ShowdownTab';
import { MiscTab } from './components/MiscTab';
import type { AwardType } from './types';

const TABS = [
  { id: 'teams', label: 'Teams' },
  { id: 'league', label: 'League' },
  { id: 'bonus', label: 'Showdown' },
  { id: 'misc', label: 'Misc.' }
];

export default function App() {
  const { loading, error, season, teams, refetch } = useSeasonData();
  const { status, claimedTeam, claiming, claimError, claim, forget } = useTeamClaim();
  const { lockTime } = useLockCountdown(season?.id ?? null);
  const byePlayerIds = useCurrentWeekByeStatus(season);
  const { names: duoNames, refetch: refetchDuoNames } = useDuoNames(teams.map(t => t.team));
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{ awardType: AwardType; playerIndex: 0 | 1 } | null>(null);
  const [namingAward, setNamingAward] = useState<AwardType | null>(null);
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  const [activeTab, setActiveTab] = useState('teams');
  // Set alongside switching to the Misc tab so MiscTab knows to force the
  // Bonus sub-tab open (currently the only deep-linked section) and which
  // element to scroll to - cleared once the target component has consumed
  // it via its own effect, but simplest to just always pass the latest
  // value down.
  const [miscScrollTarget, setMiscScrollTarget] = useState<string | null>(null);

  const myTeam = claimedTeam ? teams.find(t => t.team.id === claimedTeam.teamId) ?? null : null;
  const otherTeams = myTeam ? teams.filter(t => t.team.id !== myTeam.team.id) : teams;

  // Only meaningful once there's a claimed team - both hooks need a real
  // teamId/deviceToken, and there's nothing to edit without one.
  const picker = useDuoPicker(claimedTeam?.teamId ?? '', claimedTeam?.deviceToken ?? '');
  const naming = useDuoNaming(claimedTeam?.teamId ?? '', claimedTeam?.deviceToken ?? '');
  const background = useTeamBackground(claimedTeam?.teamId ?? '', claimedTeam?.deviceToken ?? '');

  function goToMiscSection(id: string) {
    setMiscScrollTarget(id);
    setActiveTab('misc');
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
            duoNames={duoNames}
            onNameDuo={claimedTeam ? (awardType) => setNamingAward(awardType) : undefined}
            onCustomize={claimedTeam ? () => setShowBackgroundModal(true) : undefined}
          />
        )}

        {activeTab === 'league' && (
          <LeagueTab teams={teams} myTeamId={claimedTeam?.teamId ?? null} duoNames={duoNames} />
        )}

        {activeTab === 'bonus' && (
          <ShowdownTab
            teams={teams}
            myTeamId={claimedTeam?.teamId ?? null}
            deviceToken={claimedTeam?.deviceToken ?? null}
            onLearnMore={() => goToMiscSection('bonus-matchups-rule')}
            duoNames={duoNames}
          />
        )}

        {activeTab === 'misc' && (
          <MiscTab teams={teams.map(t => t.team)} miscScrollTarget={miscScrollTarget} />
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

      {namingAward && claimedTeam && (
        <DuoNameModal
          awardType={namingAward}
          currentName={duoNames.get(duoNameKey(claimedTeam.teamId, namingAward)) ?? null}
          suggesting={naming.suggesting}
          saving={naming.saving}
          error={naming.error}
          onGetSuggestions={naming.getSuggestions}
          onSave={naming.saveName}
          onClose={() => {
            setNamingAward(null);
            refetchDuoNames();
          }}
        />
      )}

      {showBackgroundModal && myTeam && (
        <TeamBackgroundModal
          teamWithDuos={myTeam}
          uploadBackground={background.uploadBackground}
          resetBackground={background.resetBackground}
          setOpacity={background.setOpacity}
          saving={background.saving}
          onDone={() => {
            setShowBackgroundModal(false);
            refetch();
          }}
          onClose={() => setShowBackgroundModal(false)}
        />
      )}
    </div>
  );
}
