import type { NFLGameInfo } from '../types';

interface PlayerGameInfoProps {
    gameInfo: NFLGameInfo | undefined;
}

function formatKickoff(isoString: string): string {
    const date = new Date(isoString);
    const day = date.toLocaleDateString(undefined, { weekday: 'short' });
    const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${day} ${time}`;
}

// Renders nothing if there's no schedule data yet for this player's team -
// the automation hasn't fetched/saved this week's schedule, or the player
// has no resolvable NFL team. Silent rather than an error state, since
// this is a nice-to-have detail, not core functionality.
export function PlayerGameInfo({ gameInfo }: PlayerGameInfoProps) {
    if (!gameInfo) return null;

    if (gameInfo.is_bye) {
        return <span className="font-mono text-[10px] text-chalk-dim">Bye week</span>;
    }

    if (!gameInfo.opponent_nfl_team || !gameInfo.kickoff_time) return null;

    return (
        <span className="font-mono text-[10px] text-chalk-dim">
            vs {gameInfo.opponent_nfl_team} &middot; {formatKickoff(gameInfo.kickoff_time)}
        </span>
    );
}
