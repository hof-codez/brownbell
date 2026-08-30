import { useState, useEffect } from 'react';
import { HistoryTab } from './HistoryTab';
import { RulesPage } from './RulesPage';
import { PillToggle } from './PillToggle';
import type { Team } from '../types';

interface MiscTabProps {
    teams: Team[];
    /** Set when something outside this tab (Showdown's "Full rules" link)
     * requests a specific rules section - forces the Rules sub-tab open
     * and scrolls there, rather than leaving the person on whichever
     * sub-tab they'd last been viewing. */
    rulesScrollTarget: string | null;
}

export function MiscTab({ teams, rulesScrollTarget }: MiscTabProps) {
    const [subTab, setSubTab] = useState<'history' | 'rules'>('history');

    useEffect(() => {
        if (rulesScrollTarget) setSubTab('rules');
    }, [rulesScrollTarget]);

    return (
        <div>
            <div className="mb-4">
                <PillToggle
                    options={[{ id: 'history', label: 'History' }, { id: 'rules', label: 'Rules' }]}
                    value={subTab}
                    onChange={setSubTab}
                />
            </div>

            {subTab === 'history' ? (
                <HistoryTab teams={teams} />
            ) : (
                <RulesPage scrollToId={rulesScrollTarget} />
            )}
        </div>
    );
}
