import type { TeamWithDuos, AwardType } from '../types';
import { TeamCard } from './TeamCard';

interface TeamsViewProps {
    loading: boolean;
    error: string | null;
    myTeam: TeamWithDuos | null;
    otherTeams: TeamWithDuos[];
    onEditSlot: (awardType: AwardType, playerIndex: 0 | 1) => void;
    byePlayerIds?: Set<string>;
}

export function TeamsView({ loading, error, myTeam, otherTeams, onEditSlot, byePlayerIds }: TeamsViewProps) {
    if (loading) {
        return <p className="font-body text-sm text-chalk-dim">Loading teams&hellip;</p>;
    }

    if (error) {
        return (
            <div className="rounded border border-brick/50 bg-brick/10 px-4 py-3">
                <p className="font-body text-sm text-chalk">Couldn&rsquo;t load the season: {error}</p>
            </div>
        );
    }

    if (!myTeam && otherTeams.length === 0) {
        return (
            <div className="rounded border border-dashed border-panel-line px-4 py-6 text-center">
                <p className="font-body text-sm text-chalk-dim">No teams found for the current season yet.</p>
            </div>
        );
    }

    return (
        <>
            {myTeam && (
                <section className="mb-8">
                    <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-bell">Your Team</h2>
                    <div className="max-w-sm">
                        <TeamCard teamWithDuos={myTeam} onEditSlot={onEditSlot} byePlayerIds={byePlayerIds} />
                    </div>
                </section>
            )}

            {otherTeams.length > 0 && (
                <>
                    {myTeam && (
                        <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-chalk-dim">All Teams</h2>
                    )}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {otherTeams.map((teamWithDuos) => (
                            <TeamCard key={teamWithDuos.team.id} teamWithDuos={teamWithDuos} byePlayerIds={byePlayerIds} />
                        ))}
                    </div>
                </>
            )}
        </>
    );
}
