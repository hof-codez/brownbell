import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { loadCachedClaim, saveCachedClaim, clearCachedClaim } from '../lib/deviceStorage';
import type { CachedClaim } from '../types';

type ClaimStatus = 'checking' | 'unclaimed' | 'claimed';

interface UseTeamClaimResult {
    status: ClaimStatus;
    claimedTeam: CachedClaim | null;
    claiming: boolean;
    claimError: string | null;
    claim: (teamId: string, teamName: string, pin: string) => Promise<boolean>;
    forget: () => void;
}

export function useTeamClaim(): UseTeamClaimResult {
    const [status, setStatus] = useState<ClaimStatus>('checking');
    const [claimedTeam, setClaimedTeam] = useState<CachedClaim | null>(null);
    const [claiming, setClaiming] = useState(false);
    const [claimError, setClaimError] = useState<string | null>(null);

    // On load: if a device claim is cached, confirm it's still valid server-side
    // before trusting it - a cached token alone proves nothing.
    useEffect(() => {
        let cancelled = false;

        async function checkCachedClaim() {
            const cached = loadCachedClaim();
            if (!cached) {
                if (!cancelled) setStatus('unclaimed');
                return;
            }

            const { data, error } = await supabase.functions.invoke('verify-device', {
                body: { teamId: cached.teamId, deviceToken: cached.deviceToken }
            });

            if (cancelled) return;

            if (error || !data?.valid) {
                clearCachedClaim();
                setStatus('unclaimed');
            } else {
                setClaimedTeam(cached);
                setStatus('claimed');
            }
        }

        checkCachedClaim();
        return () => { cancelled = true; };
    }, []);

    const claim = useCallback(async (teamId: string, teamName: string, pin: string) => {
        setClaiming(true);
        setClaimError(null);

        const { data, error } = await supabase.functions.invoke('claim-team', {
            body: { teamId, pin, deviceLabel: navigator.userAgent.slice(0, 60) }
        });

        setClaiming(false);

        if (error || !data?.success) {
            setClaimError(data?.error || 'Something went wrong - try again.');
            return false;
        }

        const newClaim: CachedClaim = { teamId, teamName, deviceToken: data.deviceToken };
        saveCachedClaim(newClaim);
        setClaimedTeam(newClaim);
        setStatus('claimed');
        return true;
    }, []);

    const forget = useCallback(() => {
        clearCachedClaim();
        setClaimedTeam(null);
        setStatus('unclaimed');
    }, []);

    return { status, claimedTeam, claiming, claimError, claim, forget };
}
