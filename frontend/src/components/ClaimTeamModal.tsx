import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Team } from '../types';

interface ClaimTeamModalProps {
    teams: Team[];
    claiming: boolean;
    claimError: string | null;
    onClaim: (teamId: string, teamName: string, pin: string) => Promise<boolean>;
    onClose: () => void;
}

export function ClaimTeamModal({ teams, claiming, claimError, onClaim, onClose }: ClaimTeamModalProps) {
    const [selectedTeamId, setSelectedTeamId] = useState('');
    const [pin, setPin] = useState('');

    const selectedTeam = teams.find(t => t.id === selectedTeamId);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        if (!selectedTeam || !pin) return;
        const ok = await onClaim(selectedTeam.id, selectedTeam.display_name, pin);
        if (ok) onClose();
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm rounded-t-lg border border-panel-line bg-panel p-5 sm:rounded-lg">
                <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-chalk">
                    Claim Your Team
                </h2>
                <p className="mt-1 font-body text-sm text-chalk-dim">
                    First time: pick your team and set a PIN. Already claimed? Enter the same PIN to authorize this device too.
                </p>

                <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                    <div>
                        <label htmlFor="team-select" className="mb-1 block font-mono text-xs uppercase tracking-widest text-chalk-dim">
                            Your team
                        </label>
                        <select
                            id="team-select"
                            value={selectedTeamId}
                            onChange={(e) => setSelectedTeamId(e.target.value)}
                            required
                            className="w-full rounded border border-panel-line bg-field px-3 py-2 font-body text-chalk"
                        >
                            <option value="" disabled>Select your team&hellip;</option>
                            {teams.map(t => (
                                <option key={t.id} value={t.id}>{t.display_name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label htmlFor="pin-input" className="mb-1 block font-mono text-xs uppercase tracking-widest text-chalk-dim">
                            4-8 digit PIN
                        </label>
                        <input
                            id="pin-input"
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]{4,8}"
                            value={pin}
                            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                            required
                            className="w-full rounded border border-panel-line bg-field px-3 py-2 font-mono text-lg tracking-widest text-chalk"
                            placeholder="••••"
                        />
                    </div>

                    {claimError && (
                        <p className="rounded border border-brick/50 bg-brick/10 px-3 py-2 font-body text-sm text-chalk">
                            {claimError}
                        </p>
                    )}

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 rounded border border-panel-line px-4 py-2 font-body text-sm text-chalk-dim"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={claiming || !selectedTeamId || pin.length < 4}
                            className="flex-1 rounded bg-bell px-4 py-2 font-body text-sm font-medium text-field disabled:opacity-50"
                        >
                            {claiming ? 'Checking…' : 'Continue'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
