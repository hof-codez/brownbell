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

// Next Up Award (2026 rule): both players must be entering their 1st, 2nd, or
// 3rd season (years_exp 0, 1, or 2 - a player entering their 4th season,
// years_exp 3, is NOT eligible), at QB/RB/WR/TE/K, and must differ in BOTH
// years of experience and position.
export function isNextUpEligibleExperience(yearsExp: number): boolean {
    const exp = yearsExp || 0;
    return exp >= 0 && exp <= 2;
}

export function isValidNextUpCombo(a: PlayerInfo, b: PlayerInfo): boolean {
    if (!isNextUpEligibleExperience(a.yearsExp) || !isNextUpEligibleExperience(b.yearsExp)) return false;
    if (a.yearsExp === b.yearsExp) return false;
    if (a.position === b.position) return false;
    return true;
}

export const MAIN_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE']);
export const NEXTUP_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);
// Season of Boom: any 2 IDPs freely, no combo constraint at all - unlike
// Main Award (different positions required) or Next Up (different
// position AND experience tier required), so there's no isValidBoomCombo
// function to go with this - nothing to validate beyond the position list.
//
// Includes both Sleeper's broad IDP categories (DL/LB/DB) AND the more
// granular NFL position labels (DE/DT/CB/S/etc) - confirmed via a real
// support report that Sleeper's position data isn't perfectly consistent
// across every IDP: some players carry the broad category, at least one
// (Danielle Hunter) was found still tagged with the granular "DE" instead
// of "DL". Including both costs nothing and can only ever make a genuinely
// eligible player show up, never incorrectly exclude one.
export const BOOM_POSITIONS = new Set([
    'DL', 'LB', 'DB',
    'DE', 'DT', 'NT',
    'ILB', 'OLB', 'MLB',
    'CB', 'S', 'FS', 'SS'
]);
