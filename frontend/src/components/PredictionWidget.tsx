interface PredictionWidgetProps {
    teamAId: string;
    teamAName: string;
    teamBId: string;
    teamBName: string;
    currentPick: string | null;
    locked: boolean;
    canVote: boolean;
    saving: boolean;
    onPick: (teamId: string) => void;
    /** Null until at least one vote exists - nothing to show a percentage
     * split of yet. */
    voteSplit: { teamAPercent: number; teamBPercent: number; totalVotes: number } | null;
}

// Deliberately subtle - two small text buttons, no loud graphics. Hidden
// entirely (not just disabled) for anyone without a claimed team, since
// voting requires being logged into one.
export function PredictionWidget({ teamAId, teamAName, teamBId, teamBName, currentPick, locked, canVote, saving, onPick, voteSplit }: PredictionWidgetProps) {
    if (!canVote) return null;

    return (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[10px] uppercase tracking-widest text-chalk-dim">
                {locked ? 'Your pick:' : 'Who wins?'}
            </span>
            <button
                onClick={() => onPick(teamAId)}
                disabled={locked || saving}
                className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide disabled:opacity-60 ${
                    currentPick === teamAId ? 'border-bell bg-bell/20 text-chalk' : 'border-panel-line text-chalk-dim'
                }`}
            >
                {teamAName}
                {voteSplit && <span className="ml-1 text-chalk-dim">{Math.round(voteSplit.teamAPercent)}%</span>}
            </button>
            <button
                onClick={() => onPick(teamBId)}
                disabled={locked || saving}
                className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide disabled:opacity-60 ${
                    currentPick === teamBId ? 'border-bell bg-bell/20 text-chalk' : 'border-panel-line text-chalk-dim'
                }`}
            >
                {teamBName}
                {voteSplit && <span className="ml-1 text-chalk-dim">{Math.round(voteSplit.teamBPercent)}%</span>}
            </button>
        </div>
    );
}
