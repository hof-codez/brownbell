import { useState } from 'react';
import type { AwardType } from '../types';

interface DuoNameModalProps {
    awardType: AwardType;
    currentName: string | null;
    suggesting: boolean;
    saving: boolean;
    error: string | null;
    onGetSuggestions: (awardType: AwardType) => Promise<string[] | null>;
    onSave: (awardType: AwardType, name: string) => Promise<boolean>;
    onClose: () => void;
}

export function DuoNameModal({ awardType, currentName, suggesting, saving, error, onGetSuggestions, onSave, onClose }: DuoNameModalProps) {
    const [name, setName] = useState(currentName ?? '');
    const [suggestions, setSuggestions] = useState<string[] | null>(null);

    async function handleSuggest() {
        const result = await onGetSuggestions(awardType);
        if (result) setSuggestions(result);
    }

    async function handleSave() {
        const ok = await onSave(awardType, name);
        if (ok) onClose();
    }

    async function handleSkip() {
        const ok = await onSave(awardType, '');
        if (ok) onClose();
    }

    const awardLabel = awardType === 'main' ? 'Brown Bell' : awardType === 'boom' ? 'Season of Boom' : 'Next Up Award';

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm rounded-t-lg border border-panel-line bg-panel p-5 sm:rounded-lg">
                <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-chalk">
                    Name Your {awardLabel} Duo
                </h2>
                <p className="mt-1 font-body text-sm text-chalk-dim">
                    Totally optional - give your duo a nickname, or skip it.
                </p>

                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value.slice(0, 40))}
                    placeholder="Type your own name..."
                    maxLength={40}
                    className="mt-4 w-full rounded border border-panel-line bg-field px-3 py-2 font-body text-sm text-chalk"
                />
                <p className="mt-1 text-right font-mono text-[10px] text-chalk-dim">{name.length}/40</p>

                <button
                    onClick={handleSuggest}
                    disabled={suggesting}
                    className="mt-2 w-full rounded border border-panel-line px-3 py-2 font-mono text-xs uppercase tracking-widest text-bell disabled:opacity-50"
                >
                    {suggesting ? 'Thinking of names\u2026' : '\u2728 Suggest 5 names'}
                </button>

                {suggestions && (
                    <div className="mt-3 space-y-1.5">
                        {suggestions.map((s, i) => (
                            <button
                                key={i}
                                onClick={() => setName(s)}
                                className={`w-full rounded border px-3 py-2 text-left font-body text-sm ${
                                    name === s ? 'border-bell bg-bell/10 text-chalk' : 'border-panel-line bg-field/40 text-chalk-dim'
                                }`}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                )}

                {error && (
                    <p className="mt-3 rounded border border-brick/50 bg-brick/10 px-3 py-2 font-body text-sm text-chalk">
                        {error}
                    </p>
                )}

                <div className="mt-4 flex gap-2">
                    <button
                        onClick={handleSkip}
                        disabled={saving}
                        className="flex-1 rounded border border-panel-line px-4 py-2 font-body text-sm text-chalk-dim disabled:opacity-50"
                    >
                        {currentName ? 'Clear name' : 'Skip'}
                    </button>
                    <button
                        onClick={onClose}
                        className="flex-1 rounded border border-panel-line px-4 py-2 font-body text-sm text-chalk-dim"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving || name.trim().length === 0}
                        className="flex-1 rounded bg-bell px-4 py-2 font-body text-sm font-medium text-field disabled:opacity-50"
                    >
                        {saving ? 'Saving\u2026' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
}
