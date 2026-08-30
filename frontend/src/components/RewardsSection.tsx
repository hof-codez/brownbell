import { RuleSection } from './RulesPage';
import { BellIcon, SproutIcon, BoltIcon } from './icons';

// Purely informational - what each award actually pays out, separate from
// the Rules tab (how the competition works) and Bonus tab (how extra
// points are earned).
export function RewardsSection() {
    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-panel-line bg-panel p-5">
                <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-chalk">Rewards</h2>
                <p className="mt-2 font-body text-sm text-chalk-dim">
                    What each award actually wins you at the end of the season.
                </p>
            </section>

            <RuleSection title="Brown Bell">
                <div className="flex items-center gap-2">
                    <BellIcon className="h-4 w-4 shrink-0 text-bell" />
                    <p>
                        Your choice of this year&rsquo;s Madden, or an <span className="text-chalk">NFL jersey</span> of
                        any player.
                    </p>
                </div>
            </RuleSection>

            <RuleSection title="Next Up Award">
                <div className="flex items-start gap-2">
                    <SproutIcon className="mt-0.5 h-4 w-4 shrink-0 text-bell" />
                    <div>
                        <p>Winner picks <span className="text-chalk">one</span> of the following:</p>
                        <ol className="mt-1.5 list-decimal space-y-1 pl-5">
                            <li>One ticket, up to <span className="text-chalk">$100</span>, to a sports game of your choice</li>
                            <li>Your next dynasty buy-in covered</li>
                            <li>A <span className="text-chalk">$100 gift card</span> to nflshop.com</li>
                        </ol>
                    </div>
                </div>
            </RuleSection>

            <RuleSection title="Season of Boom">
                <div className="flex items-center gap-2">
                    <BoltIcon className="h-4 w-4 shrink-0 text-bell" />
                    <p>
                        One <span className="text-chalk">NFL jersey</span> of any defensive player of your choice.
                    </p>
                </div>
            </RuleSection>
        </div>
    );
}
