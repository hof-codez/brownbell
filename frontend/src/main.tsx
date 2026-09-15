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
// #/recap/<week> - checked on every render, so a visitor who just wants
// to see a static recap never triggers any of the normal app's
// data-fetching hooks (team claims, live score polling, etc.) at all.
//
// Re-runs on every hashchange event, not just once at initial load - a
// real reported bug: a link that only changes the URL's fragment (e.g.
// the recap page's own "View full standings" link, #/recap/1 ->
// #/league) is treated by the browser as an in-page navigation with no
// reload at all, so a load-time-only check would never notice the hash
// actually changed and would leave the wrong component mounted.
function render() {
  const recapMatch = window.location.hash.match(/^#\/recap\/(\d+)$/);
  const recapWeek = recapMatch ? Number(recapMatch[1]) : null;

  root.render(
    <StrictMode>
      {recapWeek !== null ? <RecapPage week={recapWeek} /> : <App />}
    </StrictMode>
  );
}

render();
window.addEventListener('hashchange', render);
