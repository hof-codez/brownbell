// _shared/nflSchedule.ts
// Checks whether a given NFL team's game has already started this week -
// the "no swaps mid-game" lock rule. Mirrors update-standings.js's corrected
// ESPN scoreboard fetch (the `dates` param, not `year` - that was a real bug
// fixed earlier this project - and the User-Agent header, since some CDNs
// challenge/block anonymous script requests).

interface EspnEvent {
    date: string;
    competitions: Array<{
        competitors: Array<{ team: { abbreviation: string } }>;
    }>;
}

const ESPN_ABBR_FIX: Record<string, string> = { WSH: 'WAS' };

// Mirrors update-standings.js's ALL_NFL_TEAMS - used only by the
// getMinutesUntilKickoff family to positively confirm a bye (team is real
// and simply absent from this week's events) rather than lumping that
// together with genuine fetch/parse failures.
const ALL_NFL_TEAMS = new Set([
    'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB',
    'HOU', 'IND', 'JAX', 'KC', 'LV', 'LAC', 'LAR', 'MIA', 'MIN', 'NE', 'NO', 'NYG',
    'NYJ', 'PHI', 'PIT', 'SF', 'SEA', 'TB', 'TEN', 'WAS'
]);

export async function hasTeamGameStarted(nflTeam: string, week: number, seasonYear: string): Promise<boolean> {
    if (!nflTeam) return false; // free agent / no team on file - never locked

    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${seasonYear}`;
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; BrownBellSetDuo/1.0)',
            'Accept': 'application/json'
        }
    });

    if (!res.ok) {
        console.warn(`Schedule fetch failed (${res.status}) - treating as not locked`);
        return false;
    }

    const data = await res.json();
    const events: EspnEvent[] = data.events || [];

    for (const event of events) {
        const competition = event.competitions?.[0];
        if (!competition) continue;

        const teams = competition.competitors
            .map(c => {
                const abbr = c.team?.abbreviation;
                return abbr && ESPN_ABBR_FIX[abbr] ? ESPN_ABBR_FIX[abbr] : abbr;
            })
            .filter(Boolean);

        if (teams.includes(nflTeam)) {
            const gameDate = new Date(event.date);
            return new Date() >= gameDate;
        }
    }

    return false;
}

// --- Below this point: Season of Boom's kickoff-timing rule, deliberately
// separate from hasTeamGameStarted above (Main Award/Next Up's existing
// boolean lock check, untouched and out of scope for this work). Split into
// a "fetch once" step and a "compute many times" step so a single request
// checking many candidates (get-eligible-roster) doesn't re-fetch the whole
// week's schedule from ESPN once per candidate. ---

export type WeekScheduleMap = Map<string, Date> | null;

// Fetches the week's schedule ONCE, returning a map of team abbreviation ->
// kickoff Date. Null means the fetch itself failed - callers should treat
// every team as genuinely unknown in that case, not assume anything.
export async function fetchWeekSchedule(week: number, seasonYear: string): Promise<WeekScheduleMap> {
    const url = `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&dates=${seasonYear}`;
    let res: Response;
    try {
        res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; BrownBellSetDuo/1.0)',
                'Accept': 'application/json'
            }
        });
    } catch {
        return null;
    }

    if (!res.ok) return null;

    const data = await res.json();
    const events: EspnEvent[] = data.events || [];
    const schedule = new Map<string, Date>();

    for (const event of events) {
        const competition = event.competitions?.[0];
        if (!competition) continue;

        const teams = competition.competitors
            .map(c => {
                const abbr = c.team?.abbreviation;
                return abbr && ESPN_ABBR_FIX[abbr] ? ESPN_ABBR_FIX[abbr] : abbr;
            })
            .filter(Boolean) as string[];

        const gameDate = new Date(event.date);
        teams.forEach(t => schedule.set(t, gameDate));
    }

    return schedule;
}

// Pure, synchronous - computes minutes until kickoff (negative if already
// started), 'bye' if confirmed on bye, or null if genuinely unknown, using
// an ALREADY-FETCHED schedule map. Mirrors update-standings.js's Node-side
// getMinutesUntilKickoff.
export function getMinutesUntilKickoffFromSchedule(schedule: WeekScheduleMap, nflTeam: string): number | 'bye' | null {
    if (!nflTeam) return null;
    if (schedule === null) return null;

    const kickoff = schedule.get(nflTeam);
    if (kickoff) return (kickoff.getTime() - Date.now()) / 60000;

    if (ALL_NFL_TEAMS.has(nflTeam)) return 'bye';
    return null;
}

// Convenience single-call version - fetches and computes in one step. Only
// use this for a ONE-OFF check; fetchWeekSchedule + repeated calls to
// getMinutesUntilKickoffFromSchedule is the right pattern for checking
// multiple candidates against the same week.
export async function getMinutesUntilKickoff(nflTeam: string, week: number, seasonYear: string): Promise<number | 'bye' | null> {
    const schedule = await fetchWeekSchedule(week, seasonYear);
    return getMinutesUntilKickoffFromSchedule(schedule, nflTeam);
}

// Universal kickoff-timing eligibility rule (currently Season of Boom
// only): a candidate can only be subbed in - by an owner or by auto-sub -
// if their own game hasn't started, with `bufferMinutes` as a safety
// margin before the exact kickoff moment. Mirrors update-standings.js's
// Node-side isEligibleForSub.
export function isEligibleForSubFromSchedule(schedule: WeekScheduleMap, nflTeam: string, bufferMinutes: number): boolean {
    const minutesUntilKickoff = getMinutesUntilKickoffFromSchedule(schedule, nflTeam);
    if (minutesUntilKickoff === 'bye') return true;
    if (minutesUntilKickoff === null) return false;
    return minutesUntilKickoff > bufferMinutes;
}
