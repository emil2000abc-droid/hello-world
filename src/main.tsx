import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { renderProject } from './audio/render';
import { engine, project, ui } from './state/app';
import { App } from './ui/App';
import './styles/app.css';

// Debug handle for automated QA and the console: open with ?debug.
if (new URLSearchParams(location.search).has('debug')) {
  Object.assign(window, { __resonix: { engine, project, ui, renderProject } });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
