import type { CachedClaim } from '../types';

const STORAGE_KEY = 'brownbell-device-claim';

export function loadCachedClaim(): CachedClaim | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed.teamId || !parsed.deviceToken) return null;
        return parsed as CachedClaim;
    } catch {
        return null;
    }
}

export function saveCachedClaim(claim: CachedClaim): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(claim));
}

export function clearCachedClaim(): void {
    localStorage.removeItem(STORAGE_KEY);
}
