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
        // Schedule fetch failed - fail OPEN (not locked) rather than blocking
        // every owner action because of an external API hiccup. This mirrors
        // the automation's own graceful-degradation choice for the same
        // failure mode (see update-standings.js's schedule-snapshot handling).
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

    // Team not found in this week's events - either a bye week or the
    // schedule hasn't posted their game yet. Either way, not locked.
    return false;
}
