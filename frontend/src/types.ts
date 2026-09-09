export type AwardType = 'main' | 'nextup' | 'boom';

export interface Season {
  id: string;
  year: number;
  current_week: number;
  sleeper_league_id: string;
}

export interface Team {
  id: string;
  display_name: string;
  sleeper_roster_id: string;
  // Independent per award - a permanent departure in one doesn't touch
  // the swap budget for the other two.
  main_permanent_swap_used: boolean;
  nextup_permanent_swap_used: boolean;
  boom_permanent_swap_used: boolean;
  background_image_url: string | null;
  background_opacity: number;
  accent_color: string | null;
}

export interface DuoRow {
  team_id: string;
  award_type: AwardType;
  player_index: 0 | 1;
  player_name: string;
  player_position: string;
  sleeper_player_id: string | null;
  /** The player's current NFL team abbreviation (e.g. 'KC') - used to look
   * up their next game from nfl_schedule. Null if unresolvable. */
  player_team: string | null;
  experience: string | null;
  /** Sleeper's raw status - 'Questionable' | 'Doubtful' | 'Out' | 'IR' | 'PUP' | null if healthy. */
  injury_status: string | null;
  /** True if this player has already left this team's actual Sleeper
   * roster (fantasy trade/drop) while the slot is still pre-lock -
   * intentionally NOT auto-cleared, since pre-lock stays fully
   * owner-editable, but the display should never look like this pick is
   * still current when it isn't. Always false once the slot locks - a
   * locked departure is actively resolved (cleared/auto-filled) instead
   * of just flagged. */
  player_departed: boolean;
}

/** A team's two duo slots for one award. A slot is null if it hasn't been set yet. */
export type DuoSlots = [DuoRow | null, DuoRow | null];

/** One NFL team's game info for a given week - from the nfl_schedule table. */
export interface NFLGameInfo {
  nfl_team: string;
  opponent_nfl_team: string | null;
  kickoff_time: string | null;
  is_bye: boolean;
}

/** A player news snippet pulled from RotoWire's free public RSS feed - see
 * 025-player-news.sql. Always shown with sourceUrl as a required
 * attribution link back to RotoWire, per their own terms for third-party
 * display of this feed. */
export interface PlayerNewsItem {
  id: string;
  sleeperPlayerId: string | null;
  playerName: string;
  headline: string;
  snippet: string;
  sourceUrl: string;
  publishedAt: string;
}

export interface TeamWithDuos {
  team: Team;
  main: DuoSlots;
  nextup: DuoSlots;
  boom: DuoSlots;
}

/** What's stored in localStorage after a successful claim - proves nothing on
 * its own; every write action must still confirm this server-side. */
export interface CachedClaim {
  teamId: string;
  teamName: string;
  deviceToken: string;
}

export interface EligibleCandidate {
  sleeperPlayerId: string;
  name: string;
  position: string;
  yearsExp: number;
  /** Current NFL team abbreviation, for looking up their next game. */
  team: string | null;
}

export type SwapSituation = 'healthy-locked' | 'temporary' | 'permanent' | null;

export interface MatchupPrediction {
  week: number;
  voterTeamId: string;
  teamAId: string;
  teamBId: string;
  predictedWinnerTeamId: string;
}

export interface MatchupTaunt {
  id: string;
  week: number;
  senderTeamId: string;
  recipientTeamId: string;
  emoji: string;
  createdAt: string;
}

export interface EligibleRosterResponse {
  locked: boolean;
  situation: SwapSituation;
  permissionReason?: string;
  currentPlayer: { name: string; position: string } | null;
  otherSlotPlayer: { name: string; position: string } | null;
  candidates: EligibleCandidate[];
  error?: string;
}
