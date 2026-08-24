interface Tab {
    id: string;
    label: string;
}

interface TabsProps {
    tabs: Tab[];
    activeTab: string;
    onChange: (id: string) => void;
}

export function Tabs({ tabs, activeTab, onChange }: TabsProps) {
    return (
        <nav className="flex gap-1 border-b border-panel-line bg-panel px-4 sm:px-6" role="tablist">
            {tabs.map(tab => {
                const active = tab.id === activeTab;
                return (
                    <button
                        key={tab.id}
                        role="tab"
                        aria-selected={active}
                        onClick={() => onChange(tab.id)}
                        className={`border-b-2 px-3 py-2.5 font-mono text-xs uppercase tracking-widest transition-colors ${
                            active
                                ? 'border-bell text-bell'
                                : 'border-transparent text-chalk-dim hover:text-chalk'
                        }`}
                    >
                        {tab.label}
                    </button>
                );
            })}
        </nav>
    );
}
