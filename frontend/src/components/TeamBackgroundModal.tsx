import { useState, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import type { Team } from '../types';

interface TeamBackgroundModalProps {
    team: Team;
    uploadBackground: (file: File, opacity: number) => Promise<{ success: boolean; error?: string }>;
    resetBackground: () => Promise<{ success: boolean; error?: string }>;
    saving: boolean;
    onDone: () => void;
    onClose: () => void;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function TeamBackgroundModal({ team, uploadBackground, resetBackground, saving, onDone, onClose }: TeamBackgroundModalProps) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(team.background_image_url);
    const [opacity, setOpacityValue] = useState(team.background_opacity);
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

    async function handleSave() {
        setError(null);
        if (!selectedFile) {
            onClose();
            return;
        }
        const result = await uploadBackground(selectedFile, opacity);
        if (result.success) {
            onDone();
        } else {
            setError(result.error || 'Could not save - try again.');
        }
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

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true">
            <div className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-t-lg border border-panel-line bg-panel p-5 sm:rounded-lg">
                <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-chalk">
                    Customize Card
                </h2>
                <p className="mt-1 font-body text-sm text-chalk-dim">
                    Visible to everyone on the Teams tab, same as your duo nicknames.
                </p>

                <div
                    className="relative mt-4 h-32 overflow-hidden rounded border border-panel-line bg-field"
                    style={previewUrl ? { backgroundImage: `url(${previewUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                >
                    <div className="absolute inset-0 bg-field" style={{ opacity: previewUrl ? 1 - opacity : 1 }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="font-body text-sm text-chalk-dim">
                            {previewUrl ? 'Preview' : 'No custom background'}
                        </span>
                    </div>
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
                        Image strength: {Math.round(opacity * 100)}%
                    </span>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={opacity}
                        onChange={e => setOpacityValue(Number(e.target.value))}
                        className="mt-1.5 block w-full"
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
                            Reset to default
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
