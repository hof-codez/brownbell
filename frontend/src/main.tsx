import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { RecapPage } from './components/RecapPage';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

const root = createRoot(rootElement);

// A shared recap link (see the recap-share Edge Function) points here as
// ?recap=<week> - checked on every render, so a visitor who just wants
// to see a static recap never triggers any of the normal app's
// data-fetching hooks (team claims, live score polling, etc.) at all.
//
// A query param, not a hash fragment - the Edge Function's redirect
// target deliberately uses one (see its own comment for why: a hash is
// never actually transmitted in the HTTP request and can be dropped by
// some in-app browsers during a cross-origin redirect, a real reported
// case where opening the link from inside Sleeper's app landed on the
// bare app root instead of the recap). The old #/recap/<week> hash
// format is still checked as a fallback, in case any already-shared
// links from before this fix are still circulating.
//
// Re-runs on every hashchange event, not just once at initial load - a
// real reported bug: a link that only changes the URL's fragment (e.g.
// the recap page's own "View full standings" link, #/league/main ->
// #/predictions/2) is treated by the browser as an in-page navigation
// with no reload at all, so a load-time-only check would never notice
// the hash actually changed and would leave the wrong component
// mounted.
function render() {
  const queryParams = new URLSearchParams(window.location.search);
  const recapFromQuery = queryParams.get('recap');
  const hashMatch = window.location.hash.match(/^#\/recap\/(\d+)$/);

  const recapWeek = recapFromQuery
    ? Number(recapFromQuery)
    : (hashMatch ? Number(hashMatch[1]) : null);

  root.render(
    <StrictMode>
      {recapWeek !== null && !Number.isNaN(recapWeek) ? <RecapPage week={recapWeek} /> : <App />}
    </StrictMode>
  );
}

render();
window.addEventListener('hashchange', render);
