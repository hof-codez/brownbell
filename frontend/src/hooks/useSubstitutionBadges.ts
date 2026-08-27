import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { TeamWithDuos, AwardType } from '../types';

export type SubstitutionBadge = 'SUB' | 'AUTO-SUB' | 'TRADE-SUB';

interface SubEntry {
    playerIndex: 0 | 1;
    substitutePlayerId: string | null;
    startWeek: number;
    endWeek: number | null;
    source: 'owner' | 'auto';
    reason: string;
}

function classify(entry: SubEntry): SubstitutionBadge | null {
    if (entry.source === 'owner') {
        // Pre-lock pick-setting is normal behavior, not a "substitution" in
        // the competitive sense - only a post-lock replacement gets a badge.
        return entry.reason.startsWith('Owner replacement') ? 'SUB' : null;
    }
    // source === 'auto'
    if (entry.reason.startsWith('Temporary')) return 'AUTO-SUB';
    if (entry.reason.startsWith('Permanent departure') && entry.substitutePlayerId) return 'TRADE-SUB';
    // "Reverted...", "No eligible replacement...", or a cleared slot - no
    // active substitute badge applies.
    return null;
}

/**
 * Returns a lookup function for substitution badges, keyed by the EXACT
 * player who scored - cross-referencing substitutions.substitute_player_id
 * directly, rather than inferring from "most recent status", so a badge
 * only ever applies to the specific player it was actually logged for.
 */
export function useSubstitutionBadges(teams: TeamWithDuos[]) {
    const [entriesByKey, setEntriesByKey] = useState<Map<string, SubEntry[]>>(new Map());
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (teams.length === 0) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        async function load() {
            const teamIds = teams.map(t => t.team.id);
            const { data } = await supabase
                .from('substitutions')
                .select('team_id, award_type, player_index, substitute_player_id, start_week, end_week, source, reason')
                .in('team_id', teamIds);

            if (cancelled) return;

            const map = new Map<string, SubEntry[]>();
            for (const row of data ?? []) {
                const key = `${row.team_id}|${row.award_type}`;
                const list = map.get(key) || [];
                list.push({
                    playerIndex: row.player_index,
                    substitutePlayerId: row.substitute_player_id,
                    startWeek: row.start_week,
                    endWeek: row.end_week,
                    source: row.source,
                    reason: row.reason || ''
                });
                map.set(key, list);
            }

            if (!cancelled) {
                setEntriesByKey(map);
                setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [teams]);

    function getBadge(teamId: string, awardType: AwardType, playerIndex: 0 | 1, week: number, sleeperPlayerId: string): SubstitutionBadge | null {
        const list = entriesByKey.get(`${teamId}|${awardType}`);
        if (!list) return null;

        const match = list.find(e =>
            e.playerIndex === playerIndex &&
            e.substitutePlayerId === sleeperPlayerId &&
            e.startWeek <= week &&
            (e.endWeek === null || e.endWeek >= week)
        );

        return match ? classify(match) : null;
    }

    return { getBadge, loading };
}
