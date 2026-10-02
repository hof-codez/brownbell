import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { BellIcon, SproutIcon, BoltIcon } from './icons';

export function RuleSection({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
    return (
        <section id={id} className="scroll-mt-4 rounded-lg border border-panel-line bg-panel p-5">
            <h3 className="font-display text-xl font-bold uppercase tracking-wide text-chalk">{title}</h3>
            <div className="mt-2 space-y-2 font-body text-sm text-chalk-dim">{children}</div>
        </section>
    );
}

interface RulesPageProps {
    /** Scrolls to and briefly highlights a specific rule section on mount,
     * if some future deep link ever needs one - nothing currently uses
     * this (the one existing deep link, the bonus matchup rules, now lives
     * in the Misc tab's Bonus sub-tab instead - see BonusRulesSection). */
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
                    <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-chalk">Brown Bell</h2>
                </div>
                <p className="mt-2 font-body text-sm text-chalk-dim">
                    Every team fields a duo of two players. The duo&rsquo;s combined weekly points determine your
                    standing in this award.
                </p>
            </section>

            <RuleSection title="Duo format">
                <p>
                    Your Brown Bell duo can be any two <span className="text-chalk">different</span> positions among{' '}
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

            <RuleSection title="Injuries - short-term (Out or Doubtful)">
                <p>
                    If your locked player is listed <span className="text-chalk">Out or Doubtful</span> but is still
                    on your roster, that&rsquo;s a short-term situation. They might still end up playing that week,
                    so the pick itself stays locked &mdash; <span className="text-chalk">Change isn&rsquo;t
                    available</span>. Instead, the slot is covered in this order:
                </p>
                <ul className="ml-4 list-disc space-y-1">
                    <li><span className="text-chalk">Your standby</span>, if you set one (see Standby substitutes below) &mdash; it steps in once your player is officially ruled Out</li>
                    <li><span className="text-chalk">Auto-sub</span>, if you didn&rsquo;t set a standby or it&rsquo;s no longer usable &mdash; it fills the slot right away from your roster</li>
                </ul>
                <p className="mt-2">
                    If you&rsquo;ve set a standby and your player is only Doubtful, nothing changes yet &mdash; your
                    player stays in, and the standby waits in case they&rsquo;re downgraded to Out. Without a
                    standby, auto-sub covers a Doubtful player too.
                </p>
                <p className="mt-2">
                    Short-term swaps only ever last the week. An auto-sub steps aside the moment your original
                    player is healthy again, and at the start of every new week the slot goes back to your
                    original player no matter who was filling it &mdash; so you always get a fresh look, and a
                    chance to set a new standby, before anything happens again. Short-term injuries never count
                    against your permanent-swap budget, no matter how often they happen.
                </p>
            </RuleSection>

            <RuleSection title="Injuries - IR or PUP">
                <p>
                    IR and PUP work differently. NFL rules keep those players out for multiple weeks with no
                    mid-week return, so there&rsquo;s no chance of them surprising everyone by playing. The slot is
                    covered the same way at first &mdash; your standby if one is set and usable, otherwise
                    auto-sub &mdash; but here you can also use <span className="text-chalk">Change</span> to pick
                    the replacement yourself, as long as that award&rsquo;s permanent swap hasn&rsquo;t been used
                    yet.
                </p>
                <p className="mt-2">
                    There&rsquo;s a limit to how long this stays temporary. Once a replacement has held the slot
                    for <span className="text-chalk">4 consecutive weeks</span> while your original player is
                    still on IR or PUP, it becomes permanent: that replacement is your new pick for the rest of
                    the season, and that award&rsquo;s permanent swap is used up. The slot shows a
                    &ldquo;Becomes permanent in&hellip;&rdquo; countdown while this is ticking. If that
                    award&rsquo;s swap is already used, there&rsquo;s no countdown &mdash; the replacement simply
                    covers until your player returns.
                </p>
                <p className="mt-2">
                    When your player comes off IR or PUP, an auto-sub steps aside right away. A replacement you
                    picked yourself hands the slot back at the start of the next week.
                </p>
            </RuleSection>

            <RuleSection title="Standby substitutes">
                <p>
                    A <span className="text-chalk">standby</span> is your own pre-picked choice for who covers a
                    slot if its player is ruled out, and it <span className="text-chalk">takes priority over
                    auto-sub</span>: when one is set and still usable, it&rsquo;s used instead of auto-sub&rsquo;s
                    pick. You can set one for any locked slot, even while your player is perfectly healthy
                    &mdash; useful for something like a surprise injury in warmups. A standby covers the week
                    it was set for.
                </p>
                <p className="mt-2">
                    You can set or change it any time before{' '}
                    <span className="text-chalk">either game has started</span> &mdash; your own player&rsquo;s,
                    or the standby&rsquo;s. Once either kicks off, the choice locks for that week, the same
                    no-early-information principle behind every other rule here. A player on a bye that week
                    can&rsquo;t be a standby.
                </p>
                <p className="mt-2">
                    A standby only activates on an official <span className="text-chalk">Out, IR, or PUP</span>{' '}
                    &mdash; never Doubtful, since a Doubtful player can still play and an activated standby
                    can&rsquo;t be taken back. Once it steps in, it&rsquo;s used up. It&rsquo;s also re-checked at
                    that moment: it still has to be on your roster, not injured itself, not already in another
                    one of your slots, and still a valid pairing with your other player. If any of that has
                    changed, auto-sub covers instead.
                </p>
                <p className="mt-2">
                    If your player plays normally, the standby simply goes unused. This works the same way for
                    all three awards, including Season of Boom.
                </p>
            </RuleSection>

            <RuleSection title="Trades &amp; releases - permanent swaps">
                <p>
                    If your locked player is traded away or released &mdash; no longer on your roster at all
                    &mdash; that&rsquo;s permanent. There&rsquo;s no auto-revert, because there&rsquo;s no original
                    player left to come back. Each award &mdash; Brown Bell, Next Up, and Season of Boom &mdash;
                    gets its <span className="text-chalk">own, independent</span> permanent swap: what happens in
                    one has no effect on the other two.
                </p>
                <p className="mt-2">
                    Unlike an injury, a permanent departure doesn&rsquo;t auto-fill right away.{' '}
                    <span className="text-chalk">The slot clears and waits for you first</span> &mdash; auto-sub
                    only steps in as a fallback once kickoff is close and you haven&rsquo;t picked yet. This is
                    the one situation where the automation deliberately gives you the first move rather than
                    filling the gap immediately: an injury still leaves the same player in the league somewhere,
                    but a trade or release genuinely changes who&rsquo;s available to you, and that&rsquo;s worth
                    a real look before anything auto-fills.
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
                <ul className="ml-4 mt-2 list-disc space-y-1">
                    <li><span className="text-chalk">That award&rsquo;s 1st permanent departure:</span> the slot clears and waits for your pick, auto-filling only as kickoff nears</li>
                    <li>
                        <span className="text-chalk">Any further permanent departure in that same award:</span> auto-sub
                        fills it immediately, no window at all
                    </li>
                </ul>
                <p className="mt-2">
                    An award&rsquo;s permanent swap gets used either by a trade or release, or by an IR/PUP
                    countdown running out (see above). Once it&rsquo;s used, Change is gone for the rest of the
                    season for <span className="text-chalk">that award specifically</span> &mdash; not just for
                    future trades, but during IR/PUP too. Standbys still work. Your other two awards are
                    completely unaffected and keep their own manual control until each independently uses its own
                    swap. Short-term injuries (Out or Doubtful) never count against this budget.
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
                    Auto-sub&rsquo;s pick always has to be someone whose own game kicks off at the same time or
                    later than the player being replaced &mdash; that&rsquo;s what stops anyone from picking a
                    replacement based on stats that already happened. It also means that when your player is in
                    the week&rsquo;s last game (usually Monday night), auto-sub often has nobody to turn to. A
                    standby, set ahead of time, covers exactly that.
                </p>
                <p className="mt-2">
                    For a short-term injury, auto-sub picks fresh each week your player is still out. During
                    IR/PUP, the same auto-sub pick stays in place &mdash; that&rsquo;s what the countdown tracks.
                    A replacement you pick yourself is never overridden by auto-sub.
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
                    rule here the way there is for Brown Bell or Next Up. Two linebackers is a perfectly valid
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
                    Season of Boom follows the exact same rules as Brown Bell and Next Up &mdash; see the
                    injury, standby, and{' '}
                    <span className="text-chalk">&ldquo;Trades &amp; releases - permanent swaps&rdquo;</span>{' '}
                    sections above. That includes its own independent permanent-swap budget, entirely separate from Brown
                    Bell&rsquo;s and Next Up&rsquo;s.
                </p>
            </RuleSection>
        </div>
    );
}
