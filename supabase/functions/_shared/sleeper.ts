// _shared/sleeper.ts
// Live Sleeper data fetches, shared between get-eligible-roster and set-duo -
// both need the same "what's actually on this team's roster right now" answer,
// and it must be the exact same logic in both places so what the picker shows
// as eligible always matches what the write endpoint will actually accept.

export interface SleeperPlayer {
    first_name?: string;
    last_name?: string;
    position?: string;
    team?: string;
    years_exp?: number;
    injury_status?: string | null;
}

export async function fetchAllPlayers(): Promise<Record<string, SleeperPlayer>> {
    const res = await fetch('https://api.sleeper.app/v1/players/nfl', {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrownBellApp/1.0)' }
    });
    if (!res.ok) throw new Error(`Sleeper players fetch failed: ${res.status}`);
    return res.json();
}

export async function fetchRosterPlayerIds(leagueId: string, sleeperRosterId: string): Promise<string[]> {
    const res = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BrownBellApp/1.0)' }
    });
    if (!res.ok) throw new Error(`Sleeper rosters fetch failed: ${res.status}`);
    const rosters: Array<{ roster_id: number; players?: string[] }> = await res.json();
    const roster = rosters.find(r => String(r.roster_id) === String(sleeperRosterId));
    return roster?.players || [];
}
