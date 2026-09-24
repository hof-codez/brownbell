import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Season, Team, DuoRow, TeamWithDuos } from '../types';

interface SeasonDataState {
  loading: boolean;
  error: string | null;
  season: Season | null;
  teams: TeamWithDuos[];
}

interface UseSeasonDataResult extends SeasonDataState {
  refetch: () => void;
}

export function useSeasonData(): UseSeasonDataResult {
  const [state, setState] = useState<SeasonDataState>({
    loading: true,
    error: null,
    season: null,
    teams: []
  });
  const [refetchTick, setRefetchTick] = useState(0);

  const refetch = useCallback(() => setRefetchTick(t => t + 1), []);

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
        .select('id, display_name, sleeper_roster_id, main_permanent_swap_used, nextup_permanent_swap_used, boom_permanent_swap_used, background_image_url, background_opacity, accent_color')
        .eq('season_id', season.id)
        .order('display_name', { ascending: true });

      if (teamsError) {
        if (!cancelled) setState({ loading: false, error: teamsError.message, season, teams: [] });
        return;
      }

      const teamIds = (teams ?? []).map((t) => t.id);
      let duos: DuoRow[] = [];

      if (teamIds.length > 0) {
        const [duosRes, activeSubsRes] = await Promise.all([
          supabase
            .from('duos')
            .select('team_id, award_type, player_index, player_name, player_position, sleeper_player_id, player_team, experience, injury_status, player_departed, original_sleeper_player_id, original_injury_status, ir_pup_weeks_until_permanent')
            .in('team_id', teamIds),
          // Only ever at most one active=true row per (team_id, award_type,
          // player_index) - logSubstitution always closes out the prior
          // one before inserting a new one. Used purely to label a
          // substituted slot as "Sub" (owner/admin) vs "Auto-sub" on the
          // Teams tab - the duos table itself has no notion of source.
          supabase
            .from('substitutions')
            .select('team_id, award_type, player_index, source, original_name, reason')
            .in('team_id', teamIds)
            .eq('active', true)
        ]);

        if (duosRes.error) {
          if (!cancelled) setState({ loading: false, error: duosRes.error.message, season, teams: [] });
          return;
        }

        const subInfoByKey = new Map<string, { source: 'owner' | 'auto' | 'admin'; originalName: string | null; reason: string | null }>();
        if (activeSubsRes.error) {
          console.error('Failed to load active substitutions (non-fatal - Sub/Auto-sub labels will be unavailable):', activeSubsRes.error.message);
        } else {
          for (const row of activeSubsRes.data ?? []) {
            subInfoByKey.set(`${row.team_id}|${row.award_type}|${row.player_index}`, { source: row.source, originalName: row.original_name ?? null, reason: row.reason ?? null });
          }
        }

        duos = (duosRes.data ?? []).map(row => {
          const subInfo = subInfoByKey.get(`${row.team_id}|${row.award_type}|${row.player_index}`);
          return {
            ...row,
            current_sub_source: subInfo?.source ?? null,
            current_sub_original_name: subInfo?.originalName ?? null,
            current_sub_reason: subInfo?.reason ?? null
          };
        });
      }

      const teamsWithDuos: TeamWithDuos[] = (teams ?? []).map((team: Team) => {
        const main: [DuoRow | null, DuoRow | null] = [null, null];
        const nextup: [DuoRow | null, DuoRow | null] = [null, null];
        const boom: [DuoRow | null, DuoRow | null] = [null, null];

        for (const duo of duos) {
          if (duo.team_id !== team.id) continue;
          const target = duo.award_type === 'main' ? main : duo.award_type === 'boom' ? boom : nextup;
          target[duo.player_index] = duo;
        }

        return { team, main, nextup, boom };
      });

      if (!cancelled) {
        setState({ loading: false, error: null, season, teams: teamsWithDuos });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refetchTick]);

  return { ...state, refetch };
}
