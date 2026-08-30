import { useState } from 'react';
import type { MatchupTaunt } from '../types';
import { ALLOWED_TAUNT_EMOJI } from '../hooks/useTaunts';

interface TauntBoxProps {
    taunts: MatchupTaunt[];
    myTeamId: string;
    sending: boolean;
    onSend: (emoji: string) => void;
}

// Only ever rendered on the viewer's OWN current matchup - taunting is
// specifically between the two actual opponents, not a league-wide thing
// like the prediction poll. Grouped by sender rather than one mixed
// chronological row, since "who sent what" is the whole point and a
// subtle opacity difference alone would be easy to miss.
export function TauntBox({ taunts, myTeamId, sending, onSend }: TauntBoxProps) {
    const [showPicker, setShowPicker] = useState(false);
    const mine = taunts.filter(t => t.senderTeamId === myTeamId);
    const theirs = taunts.filter(t => t.senderTeamId !== myTeamId);

    return (
        <div className="mt-2">
            {(mine.length > 0 || theirs.length > 0) && (
                <div className="space-y-0.5">
                    {theirs.length > 0 && (
                        <p className="font-mono text-[10px] uppercase tracking-widest text-chalk-dim">
                            Them: <span className="text-base tracking-normal">{theirs.map(t => t.emoji).join(' ')}</span>
                        </p>
                    )}
                    {mine.length > 0 && (
                        <p className="font-mono text-[10px] uppercase tracking-widest text-chalk-dim">
                            You: <span className="text-base tracking-normal">{mine.map(t => t.emoji).join(' ')}</span>
                        </p>
                    )}
                </div>
            )}

            <button
                onClick={() => setShowPicker(s => !s)}
                className="mt-1 font-mono text-[10px] uppercase tracking-widest text-chalk-dim"
            >
                {showPicker ? 'Close' : 'Taunt \u2192'}
            </button>

            {showPicker && (
                <div className="mt-1.5 grid grid-cols-8 gap-1 rounded border border-panel-line bg-field/40 p-1.5">
                    {ALLOWED_TAUNT_EMOJI.map(emoji => (
                        <button
                            key={emoji}
                            disabled={sending}
                            onClick={() => { onSend(emoji); setShowPicker(false); }}
                            className="rounded py-1 text-base disabled:opacity-50"
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
