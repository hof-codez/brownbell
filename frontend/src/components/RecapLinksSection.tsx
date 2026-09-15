import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Where Justin actually finds and shares the weekly recap link - the
// generation, storage, standalone page, and Edge Function all already
// existed, but nothing anywhere in the app itself surfaced them. This is
// that missing access point: one row per week that has a generated
// recap, with a link to preview it and a button to copy the real
// shareable link (the Edge Function URL, which is what actually produces
// a rich thumbnail when pasted into a chat - not the bare app URL).
export function RecapLinksSection() {
    const [weeks, setWeeks] = useState<number[]>([]);
    const [loading, setLoading] = useState(true);
    const [copiedWeek, setCopiedWeek] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            const { data, error } = await supabase
                .from('weekly_recaps')
                .select('week')
                .order('week', { ascending: false });

            if (cancelled) return;
            if (!error && data) setWeeks(data.map(r => r.week));
            setLoading(false);
        }

        load();
        return () => { cancelled = true; };
    }, []);

    // Derived from the same env var the app's own Supabase client uses
    // (see lib/supabase.ts), rather than a separately hardcoded project
    // ref - this way it can never drift out of sync with whichever
    // Supabase project the app is actually configured against.
    const shareUrlForWeek = (week: number) => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/recap-share/${week}`;

    async function handleCopy(week: number) {
        try {
            await navigator.clipboard.writeText(shareUrlForWeek(week));
            setCopiedWeek(week);
            setTimeout(() => setCopiedWeek(w => (w === week ? null : w)), 2000);
        } catch {
            // Clipboard access can fail (permissions, non-HTTPS, etc.) -
            // the link is still visible and selectable as plain text
            // below, so this isn't a dead end even if it does.
        }
    }

    if (loading) {
        return <p className="font-body text-sm text-chalk-dim">Loading&hellip;</p>;
    }

    if (weeks.length === 0) {
        return (
            <div className="rounded border border-dashed border-panel-line px-4 py-6 text-center">
                <p className="font-body text-sm text-chalk-dim">
                    No weekly recaps yet - one generates automatically once a week&rsquo;s Brown Bell matchups all go final.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <p className="mb-1 font-body text-xs text-chalk-dim">
                Each link covers all three awards for that week and works for anyone, whether or not they&rsquo;ve claimed a team.
            </p>
            {weeks.map(week => (
                <div key={week} className="flex items-center justify-between rounded border border-panel-line bg-panel px-4 py-3">
                    <span className="font-body text-sm font-semibold text-chalk">Week {week}</span>
                    <div className="flex items-center gap-3">
                        <a
                            href={`#/recap/${week}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-xs uppercase tracking-widest text-bell underline"
                        >
                            Preview
                        </a>
                        <button
                            onClick={() => handleCopy(week)}
                            className="rounded border border-panel-line px-2.5 py-1 font-mono text-xs uppercase tracking-widest text-chalk-dim hover:text-chalk"
                        >
                            {copiedWeek === week ? 'Copied!' : 'Copy link'}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
