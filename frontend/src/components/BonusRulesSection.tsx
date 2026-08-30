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

            <RuleSection title="Weekly bonus matchups" id="bonus-matchups-rule">
                <p>
                    Every week, your Brown Bell duo goes head-to-head against another team&rsquo;s &mdash; a
                    separate schedule from anything in Sleeper itself, rotating through every possible opponent
                    before repeating. Win your matchup (score more combined points than your opponent&rsquo;s duo
                    that week) and you&rsquo;re eligible for a bonus. Lose, and there&rsquo;s no bonus that week,
                    but it doesn&rsquo;t affect your actual Brown Bell total either.
                </p>
                <p className="mt-2">
                    Among that week&rsquo;s six winners, bonuses range from <span className="text-chalk">15</span> points
                    for the highest-scoring winner down to <span className="text-chalk">3</span> for the lowest &mdash;
                    with a deliberate gap between 1st and 2nd, so a standout week really stands out. A tie splits
                    that tier&rsquo;s bonus evenly between both teams rather than picking one over the other. Still,
                    your season-long Brown Bell total is what really matters &mdash; these are a fun weekly wrinkle,
                    not a replacement for it.
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
