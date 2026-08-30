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
  permanent_swaps_used: number;
  manual_privilege: boolean;
  background_image_url: string | null;
  background_opacity: number;
}

export interface DuoRow {
  team_id: string;
  award_type: AwardType;
  player_index: 0 | 1;
  player_name: string;
  player_position: string;
  sleeper_player_id: string | null;
  experience: string | null;
  /** Sleeper's raw status - 'Questionable' | 'Doubtful' | 'Out' | 'IR' | 'PUP' | null if healthy. */
  injury_status: string | null;
}

/** A team's two duo slots for one award. A slot is null if it hasn't been set yet. */
export type DuoSlots = [DuoRow | null, DuoRow | null];

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
}

export type SwapSituation = 'healthy-locked' | 'temporary' | 'permanent' | null;

export interface MatchupPrediction {
  week: number;
  voterTeamId: string;
  teamAId: string;
  teamBId: string;
  predictedWinnerTeamId: string;
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
