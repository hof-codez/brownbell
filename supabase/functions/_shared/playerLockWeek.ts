// _shared/playerLockWeek.ts
// Determines which week a duo slot's CURRENT occupant actually entered
// that slot - needed to correctly check whether THIS specific player has
// locked, rather than always checking week 1.
//
// Confirmed as a real bug: both get-eligible-roster and set-duo
// previously hardcoded week 1 when checking whether the current occupant
// has locked. That happens to be correct for a team's original, never-
// subbed duo member (their own first game as this slot's occupant WAS
// week 1), but is wrong for anyone who entered the slot later (an
// auto-sub, a manual swap, a standby activation) - every NFL team has
// already played "week 1" by the time any later week arrives, so the old
// hardcoded check always evaluated to "already locked" the instant a new
// occupant took the slot, regardless of whether THEIR OWN first game had
// actually happened yet.
//
// The substitutions table (see 003-substitutions.sql and its later
// migrations) already records, for any player who was ever subbed into a
// slot, which week that substitution took effect (start_week). If the
// current occupant matches a substitution's substitute_sleeper_player_id,
// that start_week is their own lock-eligibility week. If no such row
// exists at all, they've been in this slot since the season's own start,
// so week 1 remains correct for them specifically.

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function getPlayerLockWeek(
    supabase: SupabaseClient,
    teamId: string,
    awardType: string,
    playerIndex: number,
    currentSleeperPlayerId: string
): Promise<number> {
    const { data, error } = await supabase
        .from('substitutions')
        .select('start_week')
        .eq('team_id', teamId)
        .eq('award_type', awardType)
        .eq('player_index', playerIndex)
        .eq('substitute_player_id', currentSleeperPlayerId)
        .order('start_week', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('getPlayerLockWeek query failed (falling back to week 1):', error.message);
        return 1;
    }

    // No substitution row naming this exact player as the substitute
    // means they've never been subbed into this slot - they're the
    // team's original, season-start occupant, so week 1 is correct.
    return data?.start_week ?? 1;
}
