import { useState, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import type { TeamWithDuos } from '../types';
import { TeamCard } from './TeamCard';

interface TeamBackgroundModalProps {
    teamWithDuos: TeamWithDuos;
    uploadBackground: (file: File, opacity: number, accentColor?: string | null) => Promise<{ success: boolean; error?: string }>;
    resetBackground: () => Promise<{ success: boolean; error?: string }>;
    setAppearance: (changes: { opacity?: number; accentColor?: string | null }) => Promise<{ success: boolean; error?: string }>;
    saving: boolean;
    onDone: () => void;
    onClose: () => void;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_PICKER_COLOR = '#D4A574';

export function TeamBackgroundModal({ teamWithDuos, uploadBackground, resetBackground, setAppearance, saving, onDone, onClose }: TeamBackgroundModalProps) {
    const { team } = teamWithDuos;
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(team.background_image_url);
    const [opacityValue, setOpacityValue] = useState(team.background_opacity);
    const [accentColorValue, setAccentColorValue] = useState(team.accent_color ?? DEFAULT_PICKER_COLOR);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedFile) return;
        const objectUrl = URL.createObjectURL(selectedFile);
        setPreviewUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
    }, [selectedFile]);

    function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
        setError(null);
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > MAX_FILE_BYTES) {
            setError('Image must be 10 MB or smaller.');
            return;
        }
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            setError('Image must be JPEG, PNG, or WEBP.');
            return;
        }
        setSelectedFile(file);
    }

    const accentColorChanged = accentColorValue !== (team.accent_color ?? DEFAULT_PICKER_COLOR);
    const opacityChanged = opacityValue !== team.background_opacity;

    async function handleSave() {
        setError(null);

        if (selectedFile) {
            const result = await uploadBackground(selectedFile, opacityValue, accentColorChanged ? accentColorValue : undefined);
            if (result.success) { onDone(); } else { setError(result.error || 'Could not save - try again.'); }
            return;
        }

        if (opacityChanged || accentColorChanged) {
            const result = await setAppearance({
                opacity: opacityChanged ? opacityValue : undefined,
                accentColor: accentColorChanged ? accentColorValue : undefined
            });
            if (result.success) { onDone(); } else { setError(result.error || 'Could not save - try again.'); }
            return;
        }

        onClose();
    }

    async function handleReset() {
        setError(null);
        const result = await resetBackground();
        if (result.success) {
            onDone();
        } else {
            setError(result.error || 'Could not reset - try again.');
        }
    }

    const previewTeamWithDuos: TeamWithDuos = {
        ...teamWithDuos,
        team: {
            ...team,
            background_image_url: previewUrl,
            background_opacity: opacityValue,
            accent_color: accentColorValue
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true">
            <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-lg border border-panel-line bg-panel p-5 sm:rounded-lg">
                <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-chalk">
                    Customize Card
                </h2>
                <p className="mt-1 font-body text-sm text-chalk-dim">
                    Visible to everyone on the Teams tab, same as your duo nicknames.
                </p>

                <p className="mt-4 font-mono text-xs uppercase tracking-widest text-chalk-dim">Preview</p>
                <div className="mt-1.5 pointer-events-none">
                    <TeamCard teamWithDuos={previewTeamWithDuos} />
                </div>

                <label className="mt-4 block">
                    <span className="font-mono text-xs uppercase tracking-widest text-chalk-dim">Choose image</span>
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleFileChange}
                        className="mt-1.5 block w-full font-body text-sm text-chalk-dim file:mr-3 file:rounded file:border file:border-panel-line file:bg-field/40 file:px-3 file:py-1.5 file:font-mono file:text-xs file:uppercase file:tracking-widest file:text-chalk"
                    />
                </label>

                <label className="mt-4 block">
                    <span className="font-mono text-xs uppercase tracking-widest text-chalk-dim">
                        Image strength: {Math.round(opacityValue * 100)}%
                    </span>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={opacityValue}
                        onChange={e => setOpacityValue(Number(e.target.value))}
                        className="mt-1.5 block w-full"
                    />
                </label>

                <label className="mt-4 flex items-center justify-between">
                    <span className="font-mono text-xs uppercase tracking-widest text-chalk-dim">
                        Accent color <span className="normal-case text-chalk-dim/70">(name &amp; border)</span>
                    </span>
                    <input
                        type="color"
                        value={accentColorValue}
                        onChange={e => setAccentColorValue(e.target.value)}
                        className="h-8 w-14 cursor-pointer rounded border border-panel-line bg-transparent"
                    />
                </label>

                {error && (
                    <p className="mt-3 rounded border border-brick/50 bg-brick/10 px-3 py-2 font-body text-sm text-chalk">
                        {error}
                    </p>
                )}

                <div className="mt-4 space-y-2">
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full rounded border border-bell bg-bell/20 px-4 py-2 font-body text-sm text-chalk disabled:opacity-50"
                    >
                        {saving ? 'Saving\u2026' : 'Save'}
                    </button>

                    {team.background_image_url && (
                        <button
                            onClick={handleReset}
                            disabled={saving}
                            className="w-full rounded border border-panel-line px-4 py-2 font-body text-sm text-chalk-dim disabled:opacity-50"
                        >
                            Reset background to default
                        </button>
                    )}

                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="w-full rounded border border-panel-line px-4 py-2 font-body text-sm text-chalk-dim disabled:opacity-50"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
