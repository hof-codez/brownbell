import { useState, useEffect } from 'react';
import { HistoryTab } from './HistoryTab';
import { RulesPage } from './RulesPage';
import { BonusRulesSection } from './BonusRulesSection';
import { PillToggle } from './PillToggle';
import type { Team } from '../types';

interface MiscTabProps {
    teams: Team[];
    /** Set when something outside this tab (Showdown's "Learn more" link)
     * requests a specific section - forces the relevant sub-tab open and
     * scrolls there, rather than leaving the person on whichever sub-tab
     * they'd last been viewing. Currently the only such deep link is the
     * bonus matchup rules, so this always routes to the Bonus sub-tab -
     * revisit if a Rules-specific deep link is ever needed too. */
    miscScrollTarget: string | null;
}

export function MiscTab({ teams, miscScrollTarget }: MiscTabProps) {
    const [subTab, setSubTab] = useState<'history' | 'bonus' | 'rules'>('history');

    useEffect(() => {
        if (miscScrollTarget) setSubTab('bonus');
    }, [miscScrollTarget]);

    return (
        <div>
            <div className="mb-4">
                <PillToggle
                    options={[{ id: 'history', label: 'History' }, { id: 'bonus', label: 'Bonus' }, { id: 'rules', label: 'Rules' }]}
                    value={subTab}
                    onChange={setSubTab}
                />
            </div>

            {subTab === 'history' && <HistoryTab teams={teams} />}
            {subTab === 'bonus' && <BonusRulesSection scrollToId={miscScrollTarget} />}
            {subTab === 'rules' && <RulesPage />}
        </div>
    );
}
