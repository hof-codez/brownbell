// Which NFL week the UI should default to showing. Deliberately DIFFERENT
// from "whichever week has the most recent data" - that would flip to a
// new week the instant its first score comes in (as early as Thursday
// night), before people have had a chance to review the previous week's
// final results. This holds the default back until Wednesday evening,
// giving a couple of full days after Monday Night Football before moving
// on - the new week's own games haven't even started yet at that point.
//
// Anchored to the same season-start date the automation's own fallback
// week calculation uses (see getCurrentWeek in update-standings.js) - that
// formula already transitions at exactly 7-day boundaries landing on
// Wednesday (midnight UTC), which is itself only 2 days after a Monday
// night game. This just shifts that transition later by about a day, so it
// lands in Wednesday evening Arizona time instead of Wednesday at midnight
// UTC (which is only Tuesday afternoon in Arizona).
//
// NOTE: update this date every season, same as the backend's own copy.
const SEASON_START_UTC = new Date('2026-09-09T00:00:00Z').getTime();
const EVENING_DELAY_MS = 25 * 60 * 60 * 1000;

export function getDisplayWeek(now: Date = new Date()): number {
    const effectiveNow = now.getTime() - EVENING_DELAY_MS;
    const daysSinceStart = Math.floor((effectiveNow - SEASON_START_UTC) / (24 * 60 * 60 * 1000));
    const week = Math.floor(daysSinceStart / 7) + 1;
    return Math.max(1, Math.min(18, week));
}

/**
 * Picks the actual week to default to: the calendar-based display week if
 * it genuinely has recorded data, otherwise the most recent week that does
 * (covers the case where the calendar has moved on but the automation
 * simply hasn't posted this week's scores yet - never default to a week
 * with nothing to show).
 */
export function pickDefaultWeek(weeksAvailable: number[]): number | null {
    if (weeksAvailable.length === 0) return null;
    const displayWeek = getDisplayWeek();
    return weeksAvailable.includes(displayWeek) ? displayWeek : weeksAvailable[weeksAvailable.length - 1];
}
