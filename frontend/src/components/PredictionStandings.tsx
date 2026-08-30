import type { PredictionBlock } from '../hooks/usePredictions';

interface PredictionStandingsProps {
    blocks: PredictionBlock[];
}

export function PredictionStandings({ blocks }: PredictionStandingsProps) {
    const activeBlocks = blocks.filter(b => b.totalAvailable > 0);

    if (activeBlocks.length === 0) {
        return (
            <div className="rounded border border-dashed border-panel-line px-4 py-6 text-center">
                <p className="font-body text-sm text-chalk-dim">No predictions scored yet.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {activeBlocks.map(block => (
                <div key={block.label} className="rounded-lg border border-panel-line bg-panel p-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-mono text-xs uppercase tracking-widest text-bell">{block.label}</h3>
                        <span className="font-mono text-[10px] uppercase tracking-widest text-chalk-dim">
                            {block.isComplete ? 'Final' : 'In progress'}
                        </span>
                    </div>

                    {block.standings.length === 0 ? (
                        <p className="mt-2 font-body text-sm text-chalk-dim">No one has voted enough yet to qualify.</p>
                    ) : (
                        <div className="mt-2 space-y-1">
                            {block.standings.map((s, i) => (
                                <div key={s.teamId} className="flex items-center justify-between font-body text-sm">
                                    <span className={s.isWinner ? 'text-chalk' : 'text-chalk-dim'}>
                                        {i + 1}. {s.teamName}
                                        {s.isWinner && <span className="ml-1.5 text-xs text-bell">+{s.pointsAwarded.toFixed(1)} pts</span>}
                                    </span>
                                    <span className="font-mono text-xs text-chalk-dim">{s.correctCount}/{s.votesCast}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
