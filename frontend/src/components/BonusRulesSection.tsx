import { useEffect } from 'react';
import { RuleSection } from './RulesPage';
import { BellIcon } from './icons';

interface BonusRulesSectionProps {
    scrollToId?: string | null;
}

// Everything here awards points on top of a team's base season total -
// the weekly bonus matchup tiers and the prediction poll's block bonus.
// Kept together, and separate from Rules (which covers duo format,
// eligibility, and substitutions - not scoring), since both of these are
// specifically about EXTRA points layered onto the base scoring.
export function BonusRulesSection({ scrollToId }: BonusRulesSectionProps) {
    useEffect(() => {
        if (!scrollToId) return;
        const el = document.getElementById(scrollToId);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [scrollToId]);

    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-panel-line bg-panel p-5">
                <div className="flex items-center gap-2">
                    <BellIcon className="h-5 w-5 text-bell" />
                    <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-chalk">Bonus Points</h2>
                </div>
                <p className="mt-2 font-body text-sm text-chalk-dim">
                    Two separate ways to earn extra points on top of your season total - both feed into the
                    same combined number that decides the Brown Bell Award.
                </p>
            </section>

            <RuleSection title="Showdown - weekly bonus matchups" id="bonus-matchups-rule">
                <p>
                    Every week, your Brown Bell duo goes head-to-head against another team&rsquo;s on the Showdown
                    tab &mdash; a separate schedule from anything in Sleeper itself, rotating through every
                    possible opponent before repeating. Win your matchup (score more combined points than your
                    opponent&rsquo;s duo that week) and you earn a bonus. Lose, and there&rsquo;s no bonus that
                    week, but nothing is taken away from your Brown Bell total either.
                </p>
            </RuleSection>

            <RuleSection title="Showdown tiers - how much a win is worth" id="bonus-tiers-rule">
                <p>
                    There are six matchups each week, so six winners. Once they&rsquo;re all decided, the six
                    winning scores are ranked against each other: the winner with the{' '}
                    <span className="text-chalk">highest combined score</span> is Tier 1, the lowest is Tier 6.
                    Your tier depends on how many points your duo scored &mdash; not on how much you won by or
                    who you beat.
                </p>
                <table className="mt-3 w-full max-w-xs text-left">
                    <thead>
                        <tr className="border-b border-panel-line">
                            <th className="py-1 font-mono text-xs uppercase tracking-widest text-chalk-dim">Tier</th>
                            <th className="py-1 font-mono text-xs uppercase tracking-widest text-chalk-dim">Winning score</th>
                            <th className="py-1 text-right font-mono text-xs uppercase tracking-widest text-chalk-dim">Bonus</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            [1, 'Highest', 15],
                            [2, '2nd highest', 9],
                            [3, '3rd highest', 7],
                            [4, '4th highest', 5],
                            [5, '5th highest', 4],
                            [6, 'Lowest', 3]
                        ].map(([tier, label, bonus]) => (
                            <tr key={tier} className="border-b border-panel-line">
                                <td className="py-1 font-mono text-chalk">{tier}</td>
                                <td className="py-1">{label}</td>
                                <td className="py-1 text-right font-mono text-chalk">+{bonus}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p className="mt-3">
                    There&rsquo;s a deliberate gap between Tier 1 and Tier 2, so a standout week really stands
                    out. For example, if the six winners score 142, 128, 121, 110, 96, and 88, they earn 15, 9, 7,
                    5, 4, and 3 bonus points. The team that won with 88 gets 3, even if its matchup was the
                    closest one of the week.
                </p>
                <p className="mt-2">
                    <span className="text-chalk">Ties:</span> a tied matchup still takes one of the six spots,
                    ranked by the tied score, and both teams split that tier&rsquo;s bonus evenly. A tie at Tier 1
                    is worth 7.5 each; a tie at Tier 6 is worth 1.5 each.
                </p>
                <p className="mt-2">
                    <span className="text-chalk">Live vs. final:</span> during the week, the Showdown tab shows the
                    tier you&rsquo;re in <em>so far</em>. Your own win or loss is settled as soon as your four
                    players are done, but your tier can still move until every matchup that week has finished,
                    since a late game elsewhere can post a score that reshuffles the ranking. It&rsquo;s marked
                    &ldquo;not final&rdquo; until then.
                </p>
            </RuleSection>

            <RuleSection title="Points available" id="bonus-points-available-rule">
                <ul className="ml-4 list-disc space-y-1">
                    <li><span className="text-chalk">Per week:</span> 3 to 15 points for a win, 0 for a loss (1.5 to 7.5 for a tie)</li>
                    <li><span className="text-chalk">Per season:</span> Showdown runs weeks 1&ndash;14 (regular season only, not playoffs), so the most any team can earn is 210 &mdash; Tier 1 every single week</li>
                    <li><span className="text-chalk">Prediction poll:</span> another 12 points per scoring block, 48 across the season (see below)</li>
                </ul>
                <p className="mt-2">
                    All of it is added to your Brown Bell season total. Still, your duo&rsquo;s own scoring is what
                    really matters &mdash; bonuses are a fun weekly wrinkle, not a replacement for it.
                </p>
            </RuleSection>

            <RuleSection title="Prediction poll" id="prediction-poll-rule">
                <p>
                    Every one of the week&rsquo;s six bonus matchups gets a subtle pick-a-side poll &mdash; not
                    just your own matchup, any of them. Anyone logged into a claimed team can vote on who they
                    think will win each one, right up until a game involved in that specific matchup kicks off.
                </p>
                <p className="mt-2">
                    Scored in fixed 4-week blocks (weeks 1-4, 5-8, 9-12, and a shorter 13-14 to close out the
                    bonus matchup season). Whoever gets the most correct picks in a block wins{' '}
                    <span className="text-chalk">12 points</span> &mdash; but only among people who voted on at
                    least half that block&rsquo;s matchups. A tie for the most correct splits those 12 points
                    evenly. A matchup that ends in a tie doesn&rsquo;t count as anyone&rsquo;s correct pick,
                    since neither team solely won.
                </p>
            </RuleSection>
        </div>
    );
}
