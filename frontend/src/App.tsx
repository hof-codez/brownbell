import { useState, useEffect } from 'react';
import { useSeasonData } from './hooks/useSeasonData';
import { useTeamClaim } from './hooks/useTeamClaim';
import { useDuoPicker } from './hooks/useDuoPicker';
import { useStandbyPicker } from './hooks/useStandbyPicker';
import { useStandbyStatus } from './hooks/useStandbyStatus';
import { useLockCountdown } from './hooks/useLockCountdown';
import { useLeagueScores } from './hooks/useLeagueScores';
import { useNFLSchedule } from './hooks/useNFLSchedule';
import { pickDefaultWeek } from './lib/displayWeek';
import { useCurrentWeekByeStatus } from './hooks/useCurrentWeekByeStatus';
import { useDuoNames, duoNameKey } from './hooks/useDuoNames';
import { useDuoNaming } from './hooks/useDuoNaming';
import { useTeamBackground } from './hooks/useTeamBackground';
import { Header } from './components/Header';
import { ClaimStatusBar } from './components/ClaimStatusBar';
import { ClaimTeamModal } from './components/ClaimTeamModal';
import { DuoPickerModal } from './components/DuoPickerModal';
import { StandbyPickerModal } from './components/StandbyPickerModal';
import { DuoNameModal } from './components/DuoNameModal';
import { TeamBackgroundModal } from './components/TeamBackgroundModal';
import { PlayerNewsModal } from './components/PlayerNewsModal';
import { CountdownBanner } from './components/CountdownBanner';
import { Tabs } from './components/Tabs';
import { TeamsView } from './components/TeamsView';
import { LeagueTab } from './components/LeagueTab';
import { ShowdownTab } from './components/ShowdownTab';
import { MiscTab } from './components/MiscTab';
import { MyPlayersTab } from './components/MyPlayersTab';
import type { AwardType } from './types';

const BASE_TABS = [
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
  // Current-week Brown Bell score per team, shown directly on each Teams
  // tab card so checking how someone's doing right now doesn't require
  // switching to League. Reuses the same "which week counts as current"
  // logic as the League tab's own default week selection, so the number
  // shown here always matches what League would show for the same week.
  const { main: mainScores } = useLeagueScores(teams);
  const displayWeek = mainScores ? pickDefaultWeek(mainScores.weeksAvailable) : null;
  const currentWeekScores = new Map<string, number>();
  if (mainScores && displayWeek !== null) {
    for (const w of mainScores.weekly) {
      if (w.week === displayWeek) currentWeekScores.set(w.teamId, w.points);
    }
  }
  // "Next game" info shown next to each player's name on Teams cards and
  // in the replacement picker - reuses the exact same displayWeek as
  // currentWeekScores above, so both always agree on which week is
  // "current" rather than risking two independent notions of it.
  const { getGameInfo, isLastGameOfWeek } = useNFLSchedule(displayWeek);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState<{ awardType: AwardType; playerIndex: 0 | 1 } | null>(null);
  // Separate from editingSlot above - this is for pre-committing a
  // standby replacement (see StandbyPickerModal.tsx), not editing the
  // current pick itself. currentPlayerName is captured here rather than
  // looked up again inside the modal, since the modal has no other way
  // to know who it's setting a standby FOR.
  const [settingStandbyFor, setSettingStandbyFor] = useState<{ awardType: AwardType; playerIndex: 0 | 1; currentPlayerName: string } | null>(null);
  const [namingAward, setNamingAward] = useState<AwardType | null>(null);
  const [showBackgroundModal, setShowBackgroundModal] = useState(false);
  // Single shared source of truth for the player-news modal - many
  // DuoSlotDisplay instances render at once on the Teams tab, so this
  // can't be local state inside each one, or opening a second player's
  // news would stack a second modal on top of the first rather than
  // replacing it.
  const [viewingPlayerNews, setViewingPlayerNews] = useState<{ playerName: string; sleeperPlayerId: string | null } | null>(null);
  // Supports a single external deep-link case for now: the recap page's
  // "View full standings" link uses #/league or #/league/<award> so it
  // lands where it says it will, rather than always opening on the Teams
  // tab (or always Brown Bell within League) regardless of what an
  // external link actually promised. Read once at mount, same as the
  // recap hash check in main.tsx - not a general router.
  const leagueHashMatch = window.location.hash.match(/^#\/league(?:\/(main|nextup|boom))?$/);
  // The recap page's "Vote for next week" CTA (see RecapPage.tsx) links
  // here as #/predictions/<week>, landing on that week's Matchups view
  // specifically - that's where each matchup's own voting widget
  // actually lives (currentPick/voteSplit), not the separate Predictions
  // sub-view, which is only a record of past prediction accuracy, not
  // somewhere a vote can be cast.
  const predictionsHashMatch = window.location.hash.match(/^#\/predictions\/(\d+)$/);
  const [activeTab, setActiveTab] = useState(() => (leagueHashMatch ? 'league' : (predictionsHashMatch ? 'bonus' : 'teams')));
  const [initialLeagueAward, setInitialLeagueAward] = useState(() => (leagueHashMatch?.[1] as 'main' | 'nextup' | 'boom' | undefined));
  const [initialPredictionsWeek, setInitialPredictionsWeek] = useState(() => (predictionsHashMatch ? Number(predictionsHashMatch[1]) : undefined));

  // Consumed once, by whichever of LeagueTab/ShowdownTab mounts first with
  // it seeded via its own lazy useState initializer - cleared right after
  // so a LATER remount (navigating away from that tab and back) doesn't
  // keep replaying a page-load-time deep link forever. A real reported
  // bug: after following the recap's "Vote for next week" link once,
  // Showdown kept reopening on Predictions on every subsequent visit
  // instead of defaulting back to Matchups, since ShowdownTab fully
  // unmounts/remounts each time activeTab leaves and returns to 'bonus',
  // and this initial value was never being reset in between.
  useEffect(() => {
    setInitialLeagueAward(undefined);
    setInitialPredictionsWeek(undefined);
  }, []);
  // Set alongside switching to the Misc tab so MiscTab knows to force the
  // Bonus sub-tab open (currently the only deep-linked section) and which
  // element to scroll to - cleared once the target component has consumed
  // it via its own effect, but simplest to just always pass the latest
  // value down.
  const [miscScrollTarget, setMiscScrollTarget] = useState<string | null>(null);
  // Set by a team card's "History" link - separate from miscScrollTarget
  // since it carries a team id (a filter) rather than a section anchor,
  // and always targets the History sub-tab specifically.
  const [historyTeamFilter, setHistoryTeamFilter] = useState<string | null>(null);

  const myTeam = claimedTeam ? teams.find(t => t.team.id === claimedTeam.teamId) ?? null : null;
  // "My Players" only makes sense once a team is claimed - there's nothing
  // to build a feed from otherwise. Inserted right after "Teams" since
  // it's the other owner-specific view.
  const TABS = myTeam
    ? [...BASE_TABS.slice(0, -1), { id: 'players', label: 'Players' }, BASE_TABS[BASE_TABS.length - 1]]
    : BASE_TABS;

  // Guards against a rare edge case: if the owner forgets their claimed
  // team while this tab is active, myTeam goes null and the tab itself
  // disappears from TABS above - without this, activeTab would still say
  // 'players' and nothing would render at all.
  useEffect(() => {
    if (activeTab === 'players' && !myTeam) setActiveTab('teams');
  }, [activeTab, myTeam]);
  const otherTeams = myTeam ? teams.filter(t => t.team.id !== myTeam.team.id) : teams;

  // Only meaningful once there's a claimed team - both hooks need a real
  // teamId/deviceToken, and there's nothing to edit without one.
  const picker = useDuoPicker(claimedTeam?.teamId ?? '', claimedTeam?.deviceToken ?? '');
  const standbyPicker = useStandbyPicker(claimedTeam?.teamId ?? '', claimedTeam?.deviceToken ?? '');
  const { standbyByKey, refetch: refetchStandbyStatus } = useStandbyStatus(claimedTeam?.teamId ?? null, displayWeek);
  const naming = useDuoNaming(claimedTeam?.teamId ?? '', claimedTeam?.deviceToken ?? '');
  const background = useTeamBackground(claimedTeam?.teamId ?? '', claimedTeam?.deviceToken ?? '');

  function goToMiscSection(id: string) {
    setMiscScrollTarget(id);
    setActiveTab('misc');
  }

  function goToHistoryFor(teamId: string) {
    setHistoryTeamFilter(teamId);
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
            onSetStandby={(awardType, playerIndex, currentPlayerName) => setSettingStandbyFor({ awardType, playerIndex, currentPlayerName })}
            isLastGameOfWeek={isLastGameOfWeek}
            standbyByKey={standbyByKey}
            byePlayerIds={byePlayerIds}
            duoNames={duoNames}
            currentWeekScores={currentWeekScores}
            getGameInfo={getGameInfo}
            onViewPlayerNews={(playerName, sleeperPlayerId) => setViewingPlayerNews({ playerName, sleeperPlayerId })}
            onViewHistory={goToHistoryFor}
            onNameDuo={claimedTeam ? (awardType) => setNamingAward(awardType) : undefined}
            onCustomize={claimedTeam ? () => setShowBackgroundModal(true) : undefined}
          />
        )}

        {activeTab === 'players' && myTeam && (
          <MyPlayersTab myTeam={myTeam} />
        )}

        {activeTab === 'league' && (
          <LeagueTab teams={teams} myTeamId={claimedTeam?.teamId ?? null} duoNames={duoNames} initialAward={initialLeagueAward} />
        )}

        {activeTab === 'bonus' && (
          <ShowdownTab
            teams={teams}
            myTeamId={claimedTeam?.teamId ?? null}
            deviceToken={claimedTeam?.deviceToken ?? null}
            onLearnMore={() => goToMiscSection('bonus-matchups-rule')}
            duoNames={duoNames}
            getGameInfo={getGameInfo}
            initialView={initialPredictionsWeek !== undefined ? 'matchups' : undefined}
            initialWeek={initialPredictionsWeek}
          />
        )}

        {activeTab === 'misc' && (
          <MiscTab
            teams={teams.map(t => t.team)}
            miscScrollTarget={miscScrollTarget}
            historyTeamFilter={historyTeamFilter}
            onClearHistoryFilter={() => setHistoryTeamFilter(null)}
          />
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
          getGameInfo={getGameInfo}
          onDone={() => {
            setEditingSlot(null);
            refetch();
          }}
          onClose={() => setEditingSlot(null)}
        />
      )}

      {settingStandbyFor && myTeam && (
        <StandbyPickerModal
          awardType={settingStandbyFor.awardType}
          playerIndex={settingStandbyFor.playerIndex}
          currentPlayerName={settingStandbyFor.currentPlayerName}
          fetchEligible={standbyPicker.fetchEligible}
          setStandby={standbyPicker.setStandby}
          saving={standbyPicker.saving}
          getGameInfo={getGameInfo}
          onDone={() => {
            setSettingStandbyFor(null);
            refetch();
            refetchStandbyStatus();
          }}
          onClose={() => setSettingStandbyFor(null)}
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
          setAppearance={background.setAppearance}
          saving={background.saving}
          onDone={() => {
            setShowBackgroundModal(false);
            refetch();
          }}
          onClose={() => setShowBackgroundModal(false)}
        />
      )}

      {viewingPlayerNews && (
        <PlayerNewsModal
          playerName={viewingPlayerNews.playerName}
          sleeperPlayerId={viewingPlayerNews.sleeperPlayerId}
          onClose={() => setViewingPlayerNews(null)}
        />
      )}
    </div>
  );
}
