// The league's one week boundary: Wednesday at 12:00 PM Eastern
// (daylight saving handled - noon EDT or noon EST, whichever applies).
// The same calculation lives in update-standings.js (getCurrentWeek) and
// supabase/functions/_shared/currentWeek.ts - keep all three in sync.
//
// Previously the app had two separate clocks: the header and the Edge
// Functions read seasons.current_week (written by the automation, as early
// as Tuesday if Sleeper's own week moved), while game times and the
// standby button followed a separate calendar that flipped Wednesday
// evening. Confirmed as a real reported case: the header said Week 5, but
// owners couldn't set a standby until hours later, because the button was
// still reading Week 4's already-played kickoff times.
//
// NOTE: update this date every season - the Wednesday the season opens.
const SEASON_START_ET = { year: 2026, month: 9, day: 9 };
const DAY_MS = 24 * 60 * 60 * 1000;

export function getCalendarWeek(now: Date = new Date()): number {
    const parts: Record<string, string> = {};
    for (const p of new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(now)) {
        parts[p.type] = p.value;
    }
    const etDate = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
    const startDate = Date.UTC(SEASON_START_ET.year, SEASON_START_ET.month - 1, SEASON_START_ET.day);
    // Days since the season opened, counted noon-to-noon in Eastern time,
    // so each new week begins at Wednesday noon rather than midnight.
    let days = Math.round((etDate - startDate) / DAY_MS);
    if (Number(parts.hour) < 12) days -= 1;
    const week = Math.floor(days / 7) + 1;
    return Math.max(1, Math.min(18, week));
}

/**
 * The week the whole app treats as current: the calendar week, or the
 * stored seasons.current_week if that's somehow further along. Never waits
 * on the automation to roll the week - it switches exactly at Wednesday
 * noon ET, the same moment the Edge Functions do.
 */
export function getCurrentWeek(storedWeek?: number | null): number {
    return Math.max(storedWeek ?? 1, getCalendarWeek());
}

/** Kept for existing callers - same boundary as getCurrentWeek. */
export function getDisplayWeek(now: Date = new Date()): number {
    return getCalendarWeek(now);
}

/**
 * Picks the actual week to default to: the current week if it genuinely
 * has recorded data, otherwise the most recent week that does (covers the
 * moments right after a rollover, before the automation has posted the
 * new week's rows - never default to a week with nothing to show).
 */
export function pickDefaultWeek(weeksAvailable: number[]): number | null {
    if (weeksAvailable.length === 0) return null;
    const displayWeek = getDisplayWeek();
    return weeksAvailable.includes(displayWeek) ? displayWeek : weeksAvailable[weeksAvailable.length - 1];
}
