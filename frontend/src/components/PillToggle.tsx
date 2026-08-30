interface PillToggleOption<T extends string> {
    id: T;
    label: string;
}

interface PillToggleProps<T extends string> {
    options: PillToggleOption<T>[];
    value: T;
    onChange: (v: T) => void;
}

export function PillToggle<T extends string>({ options, value, onChange }: PillToggleProps<T>) {
    return (
        <div className="inline-flex rounded border border-panel-line p-0.5">
            {options.map(opt => (
                <button
                    key={opt.id}
                    onClick={() => onChange(opt.id)}
                    className={`rounded px-3 py-1 font-mono text-xs uppercase tracking-widest transition-colors ${
                        value === opt.id ? 'bg-bell text-field' : 'text-chalk-dim'
                    }`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}
