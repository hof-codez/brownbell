export type AwardType = 'main' | 'nextup';

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
}

export interface DuoRow {
  team_id: string;
  award_type: AwardType;
  player_index: 0 | 1;
  player_name: string;
  player_position: string;
  sleeper_player_id: string | null;
  experience: string | null;
}

/** A team's two duo slots for one award. A slot is null if it hasn't been set yet. */
export type DuoSlots = [DuoRow | null, DuoRow | null];

export interface TeamWithDuos {
  team: Team;
  main: DuoSlots;
  nextup: DuoSlots;
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

export interface EligibleRosterResponse {
  locked: boolean;
  currentPlayer: { name: string; position: string } | null;
  otherSlotPlayer: { name: string; position: string } | null;
  candidates: EligibleCandidate[];
  error?: string;
}
