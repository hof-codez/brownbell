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
                    Your Main Award duo must be one of three combinations: <span className="text-chalk">QB + RB</span>,{' '}
                    <span className="text-chalk">QB + WR</span>, or <span className="text-chalk">RB + WR</span>. Two
                    players at the same position &mdash; two RBs, two WRs, two QBs &mdash; is never a valid pairing.
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
                    A player locks into their slot the moment their own NFL team&rsquo;s game starts that week. Once
                    locked, that slot can&rsquo;t be changed until the following week &mdash; not even if that player
                    gets hurt mid-game. Each player locks on their own schedule, so a Thursday-night player locks
                    earlier in the week than a Monday-night player.
                </p>
            </RuleSection>

            <RuleSection title="Substitutions">
                <p>
                    If a locked player is later ruled out, injured, dropped, or traded, a replacement becomes
                    necessary. You can pick your own replacement from your current roster &mdash; anyone eligible
                    under that award&rsquo;s rules and not already locked into a game this week.
                </p>
            </RuleSection>

            <RuleSection title="Setting your picks">
                <p>
                    Claim your team once (pick your team, set a PIN) to unlock editing. From there you can set or
                    swap either duo anytime a slot isn&rsquo;t currently locked &mdash; no need to go through the
                    commissioner.
                </p>
            </RuleSection>
        </div>
    );
}
