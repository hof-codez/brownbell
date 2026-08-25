import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Team, AwardType } from '../types';

export type ActivityBadge = 'SET' | 'SUB' | 'TRADE-SUB' | 'AUTO-SUB' | 'AUTO-TRADE' | 'REVERTED' | 'CLEARED' | 'NO-SUB';

export interface ActivityEntry {
    id: string;
    teamId: string;
    teamName: string;
    awardType: AwardType;
    playerIndex: 0 | 1;
    originalName: string;
    originalPosition: string;
    substituteName: string | null;
    substitutePosition: string | null;
    week: number;
    source: 'owner' | 'auto';
    reason: string | null;
    badge: ActivityBadge;
    createdAt: string;
}

// Maps the exact reason strings written by set-duo (owner) and
// processDuoSlots (auto) to a badge - see the taxonomy pulled from last
// year's viewer. Matched by prefix since a few reasons include dynamic text
// (e.g. "Temporary - {name} is {status}"). noReplacementAvailable is checked
// FIRST and explicitly - the no-replacement reason text otherwise overlaps
// with the CLEARED text pattern ("slot cleared") and would be misclassified.
function deriveBadge(source: 'owner' | 'auto', reason: string | null, noReplacementAvailable: boolean): ActivityBadge {
    if (noReplacementAvailable) return 'NO-SUB';

    const r = reason || '';
    if (source === 'owner') {
        if (r === 'Owner set pick') return 'SET';
        if (r.startsWith('Owner replacement - permanent')) return 'TRADE-SUB';
        return 'SUB'; // 'Owner changed pick before lock' / 'Owner replacement - temporary'
    }
    // source === 'auto'
    if (r.startsWith('Reverted')) return 'REVERTED';
    if (r.includes('slot cleared')) return 'CLEARED';
    if (r.startsWith('Permanent departure')) return 'AUTO-TRADE';
    return 'AUTO-SUB'; // 'Temporary - ...'
}

export function useActivityLog(teams: Team[]) {
    const [entries, setEntries] = useState<ActivityEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (teams.length === 0) {
            setLoading(false);
            return;
        }

        let cancelled = false;

        async function load() {
            const teamIds = teams.map(t => t.id);
            const { data, error: fetchError } = await supabase
                .from('substitutions')
                .select('id, team_id, award_type, player_index, original_name, original_position, substitute_name, substitute_position, start_week, source, reason, no_replacement_available, created_at')
                .in('team_id', teamIds)
                .order('created_at', { ascending: false });

            if (cancelled) return;

            if (fetchError) {
                setError(fetchError.message);
                setLoading(false);
                return;
            }

            const teamNameById: Record<string, string> = {};
            teams.forEach(t => { teamNameById[t.id] = t.display_name; });

            const mapped: ActivityEntry[] = (data ?? []).map(row => ({
                id: row.id,
                teamId: row.team_id,
                teamName: teamNameById[row.team_id] || 'Unknown',
                awardType: row.award_type,
                playerIndex: row.player_index,
                originalName: row.original_name,
                originalPosition: row.original_position,
                substituteName: row.substitute_name,
                substitutePosition: row.substitute_position,
                week: row.start_week,
                source: row.source,
                reason: row.reason,
                badge: deriveBadge(row.source, row.reason, !!row.no_replacement_available),
                createdAt: row.created_at
            }));

            if (!cancelled) {
                setEntries(mapped);
                setLoading(false);
            }
        }

        load();
        return () => { cancelled = true; };
    }, [teams]);

    return { entries, loading, error };
}
