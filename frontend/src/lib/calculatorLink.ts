import { loadCachedClaim } from './deviceStorage';

// The trade calculator ("Hof Tradez") lives at /hof-tradez/ on the same site and uses the
// same team sign-in. The device token is passed in the URL fragment (never sent to a
// server, and the calculator strips it from the address bar right away), so it also works
// when the app is installed to the home screen and storage is not shared with the browser.
export function calculatorHref(go?: 'history'): string {
    const claim = loadCachedClaim();
    const base = '/hof-tradez/';
    const parts = [claim ? `t=${encodeURIComponent(claim.deviceToken)}` : '', go ? `go=${go}` : ''].filter(Boolean);
    return parts.length ? `${base}#${parts.join('&')}` : base;
}
