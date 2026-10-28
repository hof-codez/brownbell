import { calculatorHref } from '../lib/calculatorLink';

// League trades moved to the trade calculator, where the league's consensus on each one
// lives and updates as owners vote. This is just the doorway.
export function TradeFeedSection() {
    return (
        <section className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-panel-line bg-panel px-3 py-2.5">
            <p className="font-body text-sm text-chalk-dim">
                League trades and what the league thinks of them now live in the trade calculator.
            </p>
            <a
                href={calculatorHref('history')}
                className="whitespace-nowrap font-mono text-[10px] uppercase tracking-widest text-bell"
            >
                Open &rarr;
            </a>
        </section>
    );
}
