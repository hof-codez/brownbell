import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Season, Team, DuoRow, TeamWithDuos } from '../types';

interface SeasonDataState {
  loading: boolean;
  error: string | null;
  season: Season | null;
  teams: TeamWithDuos[];
}

export function useSeasonData(): SeasonDataState {
  const [state, setState] = useState<SeasonDataState>({
    loading: true,
    error: null,
    season: null,
    teams: []
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const { data: season, error: seasonError } = await supabase
        .from('seasons')
        .select('id, year, current_week, sleeper_league_id')
        .eq('is_active', true)
        .maybeSingle();

      if (seasonError) {
        if (!cancelled) setState({ loading: false, error: seasonError.message, season: null, teams: [] });
        return;
      }

      if (!season) {
        if (!cancelled) {
          setState({ loading: false, error: 'No active season found yet.', season: null, teams: [] });
        }
        return;
      }

      const { data: teams, error: teamsError } = await supabase
        .from('teams')
        .select('id, display_name, sleeper_roster_id')
        .eq('season_id', season.id)
        .order('display_name', { ascending: true });

      if (teamsError) {
        if (!cancelled) setState({ loading: false, error: teamsError.message, season, teams: [] });
        return;
      }

      const teamIds = (teams ?? []).map((t) => t.id);
      let duos: DuoRow[] = [];

      if (teamIds.length > 0) {
        const { data: duoRows, error: duosError } = await supabase
          .from('duos')
          .select('team_id, award_type, player_index, player_name, player_position, sleeper_player_id, experience')
          .in('team_id', teamIds);

        if (duosError) {
          if (!cancelled) setState({ loading: false, error: duosError.message, season, teams: [] });
          return;
        }
        duos = duoRows ?? [];
      }

      const teamsWithDuos: TeamWithDuos[] = (teams ?? []).map((team: Team) => {
        const main: [DuoRow | null, DuoRow | null] = [null, null];
        const nextup: [DuoRow | null, DuoRow | null] = [null, null];

        for (const duo of duos) {
          if (duo.team_id !== team.id) continue;
          const target = duo.award_type === 'main' ? main : nextup;
          target[duo.player_index] = duo;
        }

        return { team, main, nextup };
      });

      if (!cancelled) {
        setState({ loading: false, error: null, season, teams: teamsWithDuos });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
