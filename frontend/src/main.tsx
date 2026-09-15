import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { RecapPage } from './components/RecapPage';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in index.html');
}

// A shared recap link (see the recap-share Edge Function) points here as
// #/recap/<week> - checked before App even mounts, so a visitor who just
// wants to see a static recap never triggers any of the normal app's
// data-fetching hooks (team claims, live score polling, etc.) at all.
const recapMatch = window.location.hash.match(/^#\/recap\/(\d+)$/);
const recapWeek = recapMatch ? Number(recapMatch[1]) : null;

createRoot(rootElement).render(
  <StrictMode>
    {recapWeek !== null ? <RecapPage week={recapWeek} /> : <App />}
  </StrictMode>
);
