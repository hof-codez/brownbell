// _shared/eligibility.ts
// Mirrors the eligibility rules in update-standings.js (validateDuoCombination
// for Main, isValidNextUpCombo for Next Up) - kept in sync manually, same
// pattern as import-duos-2026.js, since this runs in Deno and that runs in
// Node. If either rule changes, both places need updating.

export interface PlayerInfo {
    position: string;
    yearsExp: number;
}

// Main Award: any two DIFFERENT positions among QB/RB/WR/TE - no same-position
// pairs. TE was added later in the season (2026) so a team's best player being
// a TE isn't shut out of the award.
export function isValidMainCombo(a: PlayerInfo, b: PlayerInfo): boolean {
    const validCombos = ['QB+RB', 'QB+TE', 'QB+WR', 'RB+TE', 'RB+WR', 'TE+WR'];
    const combo = [a.position, b.position].sort().join('+');
    return validCombos.includes(combo);
}

// Next Up Award (2026 rule): both players must have 0-3 yrs experience, at
// QB/RB/WR/TE/K, and must differ in BOTH years of experience and position.
export function isNextUpEligibleExperience(yearsExp: number): boolean {
    const exp = yearsExp || 0;
    return exp >= 0 && exp <= 3;
}

export function isValidNextUpCombo(a: PlayerInfo, b: PlayerInfo): boolean {
    if (!isNextUpEligibleExperience(a.yearsExp) || !isNextUpEligibleExperience(b.yearsExp)) return false;
    if (a.yearsExp === b.yearsExp) return false;
    if (a.position === b.position) return false;
    return true;
}

export const MAIN_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
export const NEXTUP_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);
