import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { scene } from './state/store';
import './index.css';

// Handle for automated checks and the console: open with ?debug.
if (new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { __solar: { scene } });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
