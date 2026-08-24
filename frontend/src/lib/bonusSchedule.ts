// Mirrors update-standings.js's generateRoundRobinSchedule and
// getBrownBellMatchupsForWeek EXACTLY - same algorithm, same sort key
// (roster_id, not display_name). If either changes, both need updating.
// This is what lets the frontend preview a future week's matchup before the
// automation has ever computed real scores for it.

export const REGULAR_SEASON_WEEKS = 14;

function generateRoundRobinSchedule(teamIds: string[]): [string, string][][] {
    const BYE = '__BYE__';
    const teams = [...teamIds];
    if (teams.length % 2 !== 0) teams.push(BYE);
    const n = teams.length;
    if (n < 2) return [];

    const rounds: [string, string][][] = [];
    const fixed = teams[0];
    let rotating = teams.slice(1);

    for (let r = 0; r < n - 1; r++) {
        const roundPairs: [string, string][] = [];
        const current = [fixed, ...rotating];
        for (let i = 0; i < n / 2; i++) {
            const a = current[i];
            const b = current[n - 1 - i];
            if (a !== BYE && b !== BYE) roundPairs.push([a, b]);
        }
        rounds.push(roundPairs);
        rotating.unshift(rotating.pop()!);
    }
    return rounds;
}

/**
 * Which 6 matchups are scheduled for a given week, using team IDs sorted by
 * roster_id (stable, immune to display_name changes) - same as the automation.
 * Returns [] for week > REGULAR_SEASON_WEEKS (playoffs - the mechanic stops).
 */
export function getScheduledMatchupsForWeek(
    teams: { id: string; sleeper_roster_id: string }[],
    week: number
): [string, string][] {
    if (week > REGULAR_SEASON_WEEKS) return [];

    const sortedTeamIds = [...teams]
        .sort((a, b) => parseInt(a.sleeper_roster_id, 10) - parseInt(b.sleeper_roster_id, 10))
        .map(t => t.id);

    const schedule = generateRoundRobinSchedule(sortedTeamIds);
    if (schedule.length === 0) return [];

    const roundIndex = (week - 1) % schedule.length;
    return schedule[roundIndex];
}
