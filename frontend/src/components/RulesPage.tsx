import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { BellIcon, SproutIcon, BoltIcon } from './icons';

function RuleSection({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
    return (
        <section id={id} className="scroll-mt-4 rounded-lg border border-panel-line bg-panel p-5">
            <h3 className="font-display text-xl font-bold uppercase tracking-wide text-chalk">{title}</h3>
            <div className="mt-2 space-y-2 font-body text-sm text-chalk-dim">{children}</div>
        </section>
    );
}

interface RulesPageProps {
    /** Scrolls to and briefly highlights a specific rule section on mount -
     * used by the Bonus tab's "Learn more" link to jump straight to the
     * bonus matchup rules instead of leaving the reader to hunt for them. */
    scrollToId?: string | null;
}

export function RulesPage({ scrollToId }: RulesPageProps) {
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

            <RuleSection title="Weekly bonus matchups" id="bonus-matchups-rule">
                <p>
                    Every week, your Main Award duo goes head-to-head against another team&rsquo;s &mdash; a
                    separate schedule from anything in Sleeper itself, rotating through every possible opponent
                    before repeating. Win your matchup (score more combined points than your opponent&rsquo;s duo
                    that week) and you&rsquo;re eligible for a bonus. Lose, and there&rsquo;s no bonus that week,
                    but it doesn&rsquo;t affect your actual Main Award total either.
                </p>
                <p className="mt-2">
                    Among that week&rsquo;s six winners, bonuses range from <span className="text-chalk">15</span> points
                    for the highest-scoring winner down to <span className="text-chalk">3</span> for the lowest &mdash;
                    with a deliberate gap between 1st and 2nd, so a standout week really stands out. A tie splits
                    that tier&rsquo;s bonus evenly between both teams rather than picking one over the other. Still,
                    your season-long Main Award total is what really matters &mdash; these are a fun weekly wrinkle,
                    not a replacement for it.
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
                    <li>Each player is individually entering their <span className="text-chalk">1st, 2nd, or 3rd season</span> (a player entering their 4th season is not eligible)</li>
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

            <RuleSection title="Bye weeks">
                <p>
                    When one of your locked players has their own NFL bye week, that slot simply scores{' '}
                    <span className="text-chalk">0</span> for the week &mdash; no substitute steps in, and it
                    doesn&rsquo;t count against you beyond that. The only thing that changes a bye week is an actual
                    roster change (the player gets traded or released); the bye itself is just honored as-is. Past
                    weeks always show a <span className="text-chalk">BYE</span> tag next to a player who sat that
                    week, so the record stays accurate no matter how much later you look back at it.
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

            <section className="rounded-lg border border-panel-line bg-panel p-5">
                <div className="flex items-center gap-2">
                    <BoltIcon className="h-5 w-5 text-bell" />
                    <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-chalk">Season of Boom Award (SOB)</h2>
                </div>
                <p className="mt-2 font-body text-sm text-chalk-dim">
                    A third, completely separate duo built around defensive players &mdash; its own standalone
                    award, not combined into the Brown Bell Award total.
                </p>
            </section>

            <RuleSection title="Duo format">
                <p>
                    Your Season of Boom duo can be <span className="text-chalk">any two</span> players at{' '}
                    <span className="text-chalk">DL, LB, or DB</span> &mdash; there&rsquo;s no position-diversity
                    rule here the way there is for Main Award or Next Up. Two linebackers is a perfectly valid
                    pairing.
                </p>
                <p className="mt-2">
                    Every roster carries at least 3 IDPs (defensive players) &mdash; two make up your active duo,
                    and the 3rd sits as your bench option in case you need it.
                </p>
            </RuleSection>

            <RuleSection title="Scoring">
                <p>
                    No weekly bonus matchups here &mdash; Season of Boom is purely a season-long total, same
                    straightforward format as Next Up.
                </p>
            </RuleSection>

            <RuleSection title="If a player gets hurt, traded, or released">
                <p>
                    This is where Season of Boom works differently from Main Award and Next Up. Instead of
                    auto-sub immediately stepping in, <span className="text-chalk">you get first crack at picking
                    your own replacement</span> &mdash; auto-sub is a safety net, not the default.
                </p>
                <p className="mt-2">
                    You can pick (or change your pick) right up until{' '}
                    <span className="text-chalk">1 minute before that player&rsquo;s own kickoff</span>. If you
                    haven&rsquo;t picked by then, auto-sub steps in on your behalf &mdash; it gives itself a wider
                    15-minute safety margin before kickoff, since it only checks periodically rather than
                    watching the clock continuously the way you can.
                </p>
                <p className="mt-2">
                    One rule applies no matter who&rsquo;s picking, you or auto-sub:{' '}
                    <span className="text-chalk">a player whose own game has already started can never be
                    subbed in</span>, even as an emergency option. This stops anyone from picking a replacement
                    based on stats that have already happened or are already live.
                </p>
                <p className="mt-2">
                    The same 2-swap-per-season budget from Main Award and Next Up applies here too: a permanent
                    departure (trade or release) gives you the same pick-it-yourself window on its first
                    occurrence; a second permanent departure in the same season auto-fills immediately with no
                    window at all, and your manual-pick privilege is done for the rest of the season. A
                    temporary departure (injury) never counts against this budget, no matter how many times it
                    happens.
                </p>
            </RuleSection>
        </div>
    );
}
