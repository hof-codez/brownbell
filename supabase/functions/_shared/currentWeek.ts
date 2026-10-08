// _shared/currentWeek.ts
// The league's one week boundary: Wednesday at 12:00 PM Eastern
// (daylight saving handled). Same calculation as the frontend's
// lib/displayWeek.ts and update-standings.js's getCurrentWeek - keep all
// three in sync.
//
// Edge Functions used to read seasons.current_week alone, which only
// changes when the automation's week-roll run finishes - so for a while
// after the frontend showed the new week, set-standby and the pickers
// were still checking last week's (already played) kickoff times.
// Taking the later of the stored week and the calendar week means every
// function switches at exactly noon, without waiting on that run.
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
    let days = Math.round((etDate - startDate) / DAY_MS);
    if (Number(parts.hour) < 12) days -= 1;
    const week = Math.floor(days / 7) + 1;
    return Math.max(1, Math.min(18, week));
}

export function getEffectiveWeek(storedWeek: number | null | undefined): number {
    return Math.max(storedWeek ?? 1, getCalendarWeek());
}
