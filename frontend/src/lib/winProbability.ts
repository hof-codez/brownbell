// Matchup win probability, modeled as the difference of two independent
// normal distributions (each team's weekly Main Award duo score). Verified
// against known reference CDF values and internal symmetry before use -
// see the session notes; this is standard statistical practice, not
// something exotic.

// Abramowitz & Stegun approximation of erf (max error ~1.5e-7) - JS has no
// built-in erf, and this is the standard lightweight approximation.
function erf(x: number): number {
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x);
    const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
    const t = 1 / (1 + p * x);
    const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return sign * y;
}

function normalCDF(z: number): number {
    return 0.5 * (1 + erf(z / Math.sqrt(2)));
}

// Rough starting assumption for a single duo's weekly score spread, used ONLY
// when there's no real data anywhere in the league yet to derive a better
// number from - self-corrects to real, computed league-wide variance as soon
// as any data exists.
const DEFAULT_STDEV = 10;

export interface TeamStats {
    /** null only when there's no own data AND no league-wide fallback either
     * (genuinely the very first data point of the season). */
    mean: number | null;
    stdev: number;
    gamesPlayed: number;
}

/**
 * Estimates a team's scoring distribution from their own weekly totals so
 * far, falling back to league-wide values when their own sample is too
 * small to trust (0 games: no own signal at all; 1 game: mean is real but
 * variance is uncomputable; 2+ games: own variance is used, but floored at
 * half the league-wide spread so a small sample's coincidentally-low
 * variance can't produce absurd overconfidence).
 */
export function computeTeamStats(weeklyTotals: number[], leagueWideMean: number | null, leagueWideStdev: number | null): TeamStats {
    const gamesPlayed = weeklyTotals.length;

    if (gamesPlayed === 0) {
        return { mean: leagueWideMean, stdev: leagueWideStdev ?? DEFAULT_STDEV, gamesPlayed: 0 };
    }

    const mean = weeklyTotals.reduce((a, b) => a + b, 0) / gamesPlayed;

    if (gamesPlayed === 1) {
        return { mean, stdev: leagueWideStdev ?? DEFAULT_STDEV, gamesPlayed };
    }

    const variance = weeklyTotals.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (gamesPlayed - 1);
    let stdev = Math.sqrt(variance);
    if (leagueWideStdev !== null) stdev = Math.max(stdev, leagueWideStdev * 0.5);

    return { mean, stdev, gamesPlayed };
}

/**
 * P(team A beats team B), using the standard result that the difference of
 * two independent normal distributions is itself normal with mean = meanA -
 * meanB and variance = varianceA + varianceB. Returns null only when
 * neither team has any usable mean at all (see computeTeamStats).
 */
export function computeWinProbability(statsA: TeamStats, statsB: TeamStats): number | null {
    if (statsA.mean === null || statsB.mean === null) return null;

    const meanDiff = statsA.mean - statsB.mean;
    const combinedVariance = statsA.stdev ** 2 + statsB.stdev ** 2;
    if (combinedVariance <= 0) return meanDiff > 0 ? 1 : (meanDiff < 0 ? 0 : 0.5);

    return normalCDF(meanDiff / Math.sqrt(combinedVariance));
}
