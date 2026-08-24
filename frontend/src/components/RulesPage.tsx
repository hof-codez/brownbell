import type { ReactNode } from 'react';
import { BellIcon, SproutIcon } from './icons';

function RuleSection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="rounded-lg border border-panel-line bg-panel p-5">
            <h3 className="font-display text-xl font-bold uppercase tracking-wide text-chalk">{title}</h3>
            <div className="mt-2 space-y-2 font-body text-sm text-chalk-dim">{children}</div>
        </section>
    );
}

export function RulesPage() {
    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-panel-line bg-panel p-5">
                <div className="flex items-center gap-2">
                    <BellIcon className="h-5 w-5 text-bell" />
                    <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-chalk">Main Award</h2>
                </div>
                <p className="mt-2 font-body text-sm text-chalk-dim">
                    Every team fields a duo of two players. The duo&rsquo;s combined weekly points determine your
                    standing in this award.
                </p>
            </section>

            <RuleSection title="Duo format">
                <p>
                    Your Main Award duo can be any two <span className="text-chalk">different</span> positions among{' '}
                    <span className="text-chalk">QB, RB, WR, and TE</span>. Two players at the same position &mdash;
                    two RBs, two WRs, two TEs, two QBs &mdash; is never a valid pairing. Kickers aren&rsquo;t eligible
                    for this award.
                </p>
            </RuleSection>

            <RuleSection title="Eligibility">
                <p>
                    Only players currently on your Sleeper roster are eligible. If a player you&rsquo;d want isn&rsquo;t
                    showing up as an option, they&rsquo;re not on your roster right now.
                </p>
            </RuleSection>

            <section className="rounded-lg border border-panel-line bg-panel p-5">
                <div className="flex items-center gap-2">
                    <SproutIcon className="h-5 w-5 text-bell" />
                    <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-chalk">Next Up Award</h2>
                </div>
                <p className="mt-2 font-body text-sm text-chalk-dim">
                    A second duo built around emerging talent &mdash; rewarding teams for identifying breakout
                    rookies and young players early.
                </p>
            </section>

            <RuleSection title="Duo format">
                <p>Both players in your Next Up duo must meet three conditions at the same time:</p>
                <ul className="ml-4 list-disc space-y-1">
                    <li>Each player individually has <span className="text-chalk">0&ndash;3 years</span> of NFL experience (rookie through 3rd-year)</li>
                    <li>The two players have <span className="text-chalk">different</span> years of experience from each other</li>
                    <li>The two players play <span className="text-chalk">different</span> positions from each other</li>
                </ul>
                <p className="mt-2">
                    So a rookie WR paired with a 2nd-year RB works. Two rookies don&rsquo;t &mdash; same experience
                    year. A rookie WR paired with a 2nd-year WR doesn&rsquo;t either &mdash; same position. QB, RB, WR,
                    TE, and K are all eligible positions for this award.
                </p>
            </RuleSection>

            <RuleSection title="Locking">
                <p>
                    A player locks into their slot permanently for the rest of the season the moment their own NFL
                    team&rsquo;s first game starts &mdash; not just for that week. Once locked, that slot stays locked
                    through the end of the season, no matter how the player performs, unless they&rsquo;re later
                    injured, dropped, or traded (see Substitutions below). Each player locks on their own schedule,
                    so a Thursday-night player locks earlier than a Sunday or Monday-night player &mdash; but for
                    everyone, it&rsquo;s a one-time, season-long lock, not something that resets week to week.
                </p>
            </RuleSection>

            <RuleSection title="Injuries - temporary swaps">
                <p>
                    If your locked player is ruled out, doubtful, or placed on IR &mdash; but is still on your
                    roster &mdash; that&rsquo;s a temporary situation. You can pick a replacement from your current
                    roster, and there&rsquo;s no limit on how many times this can happen over the season.
                </p>
                <p className="mt-2">
                    The moment the original player is active again, they&rsquo;re <span className="text-chalk">automatically
                    restored</span> to their slot &mdash; you don&rsquo;t need to remember to swap them back.
                </p>
            </RuleSection>

            <RuleSection title="Trades &amp; releases - permanent swaps">
                <p>
                    If your locked player is traded away or released &mdash; no longer on your roster at all
                    &mdash; that&rsquo;s permanent. There&rsquo;s no auto-revert, because there&rsquo;s no original
                    player left to come back. Each team gets <span className="text-chalk">two</span> of these
                    permanent swaps per season:
                </p>
                <ul className="ml-4 mt-2 list-disc space-y-1">
                    <li><span className="text-chalk">1st permanent swap:</span> you pick the replacement yourself</li>
                    <li>
                        <span className="text-chalk">2nd permanent swap:</span> auto-sub fills it immediately, no
                        manual pick offered
                    </li>
                </ul>
                <p className="mt-2">
                    Once that 2nd swap happens, manual control is gone for the rest of the season &mdash; not just
                    for future trades, but for injuries too. Every gap after that, for either award, is filled by
                    auto-sub.
                </p>
            </RuleSection>

            <RuleSection title="How auto-sub picks a replacement">
                <p>
                    Auto-sub looks at everyone currently eligible on your roster, ranks them by their average points
                    over the last 3 weeks, and picks <span className="text-chalk">randomly among the top 4</span>
                    &mdash; not always the single highest scorer. That keeps things competitive without making
                    every auto-sub the same obvious pick.
                </p>
                <p className="mt-2">
                    While a slot is being filled by auto-sub (not a manual pick), it can reshuffle to a different
                    top-4 candidate week to week as long as the original player is still out. Once you manually pick
                    someone yourself, that pick stays &mdash; auto-sub won&rsquo;t override it.
                </p>
            </RuleSection>

            <RuleSection title="Setting your picks">
                <p>
                    Claim your team once (pick your team, set a PIN) to unlock editing. Before a slot locks, you can
                    set or swap it freely &mdash; no need to go through the commissioner.
                </p>
            </RuleSection>
        </div>
    );
}
