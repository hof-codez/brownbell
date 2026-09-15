import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface MatchupSummary {
    teamA: string;
    teamB: string;
    scoreA: number;
    scoreB: number;
    winner: string | null;
    tier: number | null;
    bonus: number;
    margin: number;
}

interface TopScorer {
    teamName: string;
    playerName: string;
    playerPosition: string;
    points: number;
}

interface StandingsRow {
    rank: number;
    teamName: string;
    combined: number;
    seasonTotal: number;
    bonusTotal: number;
}

interface MainAwardRecap {
    matchupOfTheWeek: MatchupSummary | null;
    matchups: MatchupSummary[];
    biggestBlowout: MatchupSummary | null;
    topScorer: TopScorer | null;
    biggestUpset: { winner: string; loser: string; winnerProbability: number; scoreWinner: number; scoreLoser: number } | null;
    leaguePredictions: {
        record: { correct: number; wrong: number };
        matchups: { teamA: string; teamB: string; percentA: number; percentB: number; winner: string | null; leagueCorrect: boolean | null }[];
    } | null;
    standingsTop3: StandingsRow[];
}

// Next Up and Season of Boom have no opponent, tier, bonus, or prediction
// mechanic at all - each is simply a standalone season-long point race
// per team, so their recap section only ever has these two things.
interface SimpleAwardRecap {
    topScorer: TopScorer | null;
    standingsTop3: StandingsRow[];
}

interface RecapContent {
    week: number;
    main: MainAwardRecap;
    nextup: SimpleAwardRecap;
    boom: SimpleAwardRecap;
}

interface RecapPageProps {
    week: number;
}

const AWARD_TABS: { id: 'main' | 'nextup' | 'boom'; label: string }[] = [
    { id: 'main', label: 'Brown Bell' },
    { id: 'nextup', label: 'Next Up' },
    { id: 'boom', label: 'Season of Boom' }
];

// The standalone page rendered for a shared recap link
// (hof-codez.github.io/brownbell/#/recap/<week>) - no team claim, no tabs
// beyond the award selector below, no normal app shell. Deliberately its
// own self-contained component (rather than reusing ShowdownTab's
// matchup cards) since this reads a single static, already-computed JSON
// blob rather than any of the app's live hooks - the whole point of a
// shared link is that it never changes after the fact, so there's
// nothing here to keep in sync with live data at all.
export function RecapPage({ week }: RecapPageProps) {
    const [content, setContent] = useState<RecapContent | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [activeAward, setActiveAward] = useState<'main' | 'nextup' | 'boom'>('main');

    useEffect(() => {
        let cancelled = false;

        async function load() {
            const { data, error } = await supabase
                .from('weekly_recaps')
                .select('content')
                .eq('week', week)
                .maybeSingle();

            if (cancelled) return;

            if (error || !data) {
                setNotFound(true);
            } else {
                setContent(data.content as RecapContent);
            }
            setLoading(false);
        }

        load();
        return () => { cancelled = true; };
    }, [week]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-field">
                <p className="font-body text-sm text-chalk-dim">Loading&hellip;</p>
            </div>
        );
    }

    if (notFound || !content) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-field px-6 text-center">
                <p className="font-display text-2xl font-bold text-chalk">No recap for Week {week}</p>
                <p className="font-body text-sm text-chalk-dim">This week hasn&rsquo;t finished yet, or doesn&rsquo;t exist.</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-field px-4 py-8 text-chalk">
            <div className="mx-auto max-w-2xl">
                <header className="mb-6 text-center">
                    <p className="font-mono text-xs uppercase tracking-widest text-bell">Dynasty Side Awards</p>
                    <h1 className="mt-1 font-display text-4xl font-bold uppercase tracking-wide">
                        Brown Bell <span className="text-bell">&amp;</span> Next Up
                    </h1>
                    <p className="mt-1 font-body text-sm text-chalk-dim">Week {content.week} Recap</p>
                </header>

                <div className="mb-6 flex justify-center gap-1 rounded-lg border border-panel-line bg-panel p-1">
                    {AWARD_TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveAward(tab.id)}
                            className={`flex-1 rounded px-3 py-2 font-mono text-xs uppercase tracking-widest transition-colors ${
                                activeAward === tab.id ? 'bg-bell text-field' : 'text-chalk-dim'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activeAward === 'main' && <MainAwardSections recap={content.main} />}
                {activeAward === 'nextup' && <SimpleAwardSections recap={content.nextup} awardLabel="Next Up" />}
                {activeAward === 'boom' && <SimpleAwardSections recap={content.boom} awardLabel="Season of Boom" />}
            </div>
        </div>
    );
}

function MainAwardSections({ recap }: { recap: MainAwardRecap }) {
    return (
        <>
            {recap.matchupOfTheWeek && (
                <Section title="Matchup of the Week">
                    <MatchupCard m={recap.matchupOfTheWeek} highlight />
                </Section>
            )}

            <Section title="This Week's Matchups">
                <div className="flex flex-col gap-2">
                    {recap.matchups.map((m, i) => (
                        <MatchupCard key={i} m={m} />
                    ))}
                </div>
            </Section>

            {recap.biggestBlowout && (
                <Section title="Biggest Blowout">
                    <MatchupCard m={recap.biggestBlowout} note={`${recap.biggestBlowout.margin.toFixed(1)} point margin`} />
                </Section>
            )}

            {recap.topScorer && (
                <Section title="Top Scorer">
                    <TopScorerCard scorer={recap.topScorer} />
                </Section>
            )}

            {recap.biggestUpset && (
                <Section title="Biggest Upset">
                    <div className="rounded-lg border border-panel-line bg-panel px-4 py-3">
                        <p className="font-body text-sm text-chalk">
                            <span className="font-semibold text-chalk">{recap.biggestUpset.winner}</span> beat{' '}
                            <span className="text-chalk-dim">{recap.biggestUpset.loser}</span>
                            {' '}{recap.biggestUpset.scoreWinner.toFixed(1)}-{recap.biggestUpset.scoreLoser.toFixed(1)}
                        </p>
                        <p className="mt-1 font-mono text-xs text-chalk-dim">
                            Given only a {(recap.biggestUpset.winnerProbability * 100).toFixed(0)}% chance beforehand
                        </p>
                    </div>
                </Section>
            )}

            {recap.leaguePredictions && (
                <Section title="League Predictions">
                    <div className="mb-2 rounded-lg border border-panel-line bg-panel px-4 py-3 text-center">
                        <p className="font-mono text-2xl font-bold text-bell">
                            {recap.leaguePredictions.record.correct}-{recap.leaguePredictions.record.wrong}
                        </p>
                        <p className="font-body text-xs text-chalk-dim">the league&rsquo;s record calling this week&rsquo;s matchups</p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {recap.leaguePredictions.matchups.map((pm, i) => (
                            <div key={i} className="flex items-center justify-between rounded border border-panel-line bg-panel px-3 py-2 font-body text-xs">
                                <span className="text-chalk-dim">
                                    {pm.percentA >= pm.percentB ? pm.teamA : pm.teamB} favored {Math.max(pm.percentA, pm.percentB).toFixed(0)}%
                                </span>
                                {pm.leagueCorrect !== null && (
                                    <span className={pm.leagueCorrect ? 'text-bell' : 'text-brick'}>
                                        {pm.leagueCorrect ? 'Correct' : 'Wrong'}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            <StandingsSection standingsTop3={recap.standingsTop3} />
        </>
    );
}

function SimpleAwardSections({ recap, awardLabel }: { recap: SimpleAwardRecap; awardLabel: string }) {
    return (
        <>
            {recap.topScorer ? (
                <Section title="Top Scorer">
                    <TopScorerCard scorer={recap.topScorer} />
                </Section>
            ) : (
                <p className="mb-6 text-center font-body text-sm text-chalk-dim">No {awardLabel} scores recorded yet this week.</p>
            )}
            <StandingsSection standingsTop3={recap.standingsTop3} />
        </>
    );
}

function StandingsSection({ standingsTop3 }: { standingsTop3: StandingsRow[] }) {
    if (standingsTop3.length === 0) return null;
    return (
        <Section title="Standings Snapshot">
            <div className="rounded-lg border border-panel-line bg-panel">
                {standingsTop3.map((row, i) => (
                    <div
                        key={row.teamName}
                        className={`flex items-center justify-between px-4 py-2.5 ${i > 0 ? 'border-t border-panel-line' : ''}`}
                    >
                        <span className="font-body text-sm text-chalk">
                            <span className="mr-2 text-bell">#{row.rank}</span>
                            {row.teamName}
                        </span>
                        <span className="font-mono text-sm font-semibold text-chalk">{row.combined.toFixed(1)}</span>
                    </div>
                ))}
            </div>
            <a
                href="https://hof-codez.github.io/brownbell/"
                className="mt-2 block text-center font-mono text-xs uppercase tracking-widest text-bell underline"
            >
                View full standings &rarr;
            </a>
        </Section>
    );
}

function TopScorerCard({ scorer }: { scorer: TopScorer }) {
    return (
        <div className="rounded-lg border border-panel-line bg-panel px-4 py-3">
            <p className="font-body text-lg font-semibold text-chalk">
                {scorer.playerName} <span className="text-sm text-chalk-dim">({scorer.playerPosition})</span>
            </p>
            <p className="font-mono text-2xl font-bold text-bell">{scorer.points.toFixed(1)} pts</p>
            <p className="font-body text-xs text-chalk-dim">{scorer.teamName}</p>
        </div>
    );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="mb-6">
            <h2 className="mb-2 font-mono text-xs uppercase tracking-widest text-chalk-dim">{title}</h2>
            {children}
        </section>
    );
}

function MatchupCard({ m, highlight, note }: { m: MatchupSummary; highlight?: boolean; note?: string }) {
    const aWon = m.winner === m.teamA;
    const bWon = m.winner === m.teamB;

    return (
        <div className={`rounded-lg border px-4 py-3 ${highlight ? 'border-bell bg-bell/10' : 'border-panel-line bg-panel'}`}>
            <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                    <p className={`truncate font-body text-sm font-semibold ${aWon ? 'text-chalk' : 'text-chalk-dim'}`}>{m.teamA}</p>
                    <p className={`font-mono text-xl font-bold ${aWon ? 'text-chalk' : 'text-chalk-dim'}`}>{m.scoreA.toFixed(1)}</p>
                </div>
                <span className="mx-3 font-mono text-xs text-chalk-dim">vs</span>
                <div className="min-w-0 flex-1 text-right">
                    <p className={`truncate font-body text-sm font-semibold ${bWon ? 'text-chalk' : 'text-chalk-dim'}`}>{m.teamB}</p>
                    <p className={`font-mono text-xl font-bold ${bWon ? 'text-chalk' : 'text-chalk-dim'}`}>{m.scoreB.toFixed(1)}</p>
                </div>
            </div>
            {(m.tier || note) && (
                <p className="mt-2 font-mono text-xs text-chalk-dim">
                    {m.tier && `Tier ${m.tier} \u00b7 +${m.bonus.toFixed(2)} bonus`}
                    {m.tier && note && ' \u00b7 '}
                    {note}
                </p>
            )}
        </div>
    );
}
