import { useEffect } from 'react';
import { loadBuiltins } from '../audio/samples';
import { currentPatternId, engine, patchUi, project, selectedChannelId, setView, toast, ui, useEngine, useUi, type ViewId } from '../state/app';
import { onFileSaved } from '../project/file';
import { initNativeShell } from '../platform/native';
import { connectRecording, loadUserSampleLibrary, restoreLastSession, saveNow, scheduleAutosave } from '../state/persistence';
import { Icon } from './components/Icon';
import { ContextMenu, PromptDialog, Toasts } from './components/Overlays';
import { Browser } from './panels/Browser';
import { ChannelRack } from './panels/ChannelRack';
import { ExportDialog } from './panels/ExportDialog';
import { Mixer } from './panels/Mixer';
import { PianoRoll } from './panels/PianoRoll';
import { Playlist } from './panels/Playlist';
import { TopBar } from './panels/TopBar';
import { Windows } from './panels/Windows';
import { cx } from './util';

const VIEWS: { id: ViewId; label: string; icon: string; key: string }[] = [
  { id: 'playlist', label: 'Playlist', icon: 'playlist', key: 'F5' },
  { id: 'rack', label: 'Channel Rack', icon: 'rack', key: 'F6' },
  { id: 'piano', label: 'Piano Roll', icon: 'piano', key: 'F7' },
  { id: 'mixer', label: 'Mixer', icon: 'mixer', key: 'F9' },
];

// FL-style typing keyboard: two rows, an octave each.
const KEYMAP: Record<string, number> = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, ',': 12, l: 13, '.': 14,
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23, i: 24, '9': 25, o: 26, '0': 27, p: 28,
};

function View({ id }: { id: ViewId }) {
  switch (id) {
    case 'playlist':
      return <Playlist />;
    case 'rack':
      return <ChannelRack />;
    case 'piano':
      return <PianoRoll />;
    case 'mixer':
      return <Mixer />;
  }
}

function useBoot() {
  useEffect(() => {
    let off = false;
    // Keep the engine in sync with the project and autosave on change.
    // The engine follows the edited pattern and the selected channel (live input).
    const syncSelection = () => {
      engine.setPattern(currentPatternId());
      engine.setLiveChannel(selectedChannelId());
    };
    engine.setProject(project.get());
    const unsub = project.subscribe(() => {
      engine.setProject(project.get());
      syncSelection();
      scheduleAutosave();
    });
    const unsubUi = ui.subscribe(syncSelection);
    connectRecording();
    void (async () => {
      const restore = async () => {
        await loadUserSampleLibrary();
        if (!off) await restoreLastSession();
      };
      await Promise.all([loadBuiltins(engine.bank, engine.ctx.sampleRate).catch(() => {}), restore()]);
      if (off) return;
      syncSelection();
      patchUi({ booted: true });
    })();
    // Browsers only start audio after a user gesture.
    const unlock = () => void engine.resume();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    const beforeUnload = () => void saveNow();
    window.addEventListener('pagehide', beforeUnload);
    onFileSaved((text) => toast(text, 'success'));
    initNativeShell({ back: closeTopmost, pause: () => void saveNow() });
    // Narrow screens start without the browser panel.
    if (window.innerWidth < 900) patchUi({ browserOpen: false });
    return () => {
      off = true;
      unsub();
      unsubUi();
      window.removeEventListener('pointerdown', unlock, { capture: true });
      window.removeEventListener('keydown', unlock, { capture: true });
      window.removeEventListener('pagehide', beforeUnload);
    };
  }, []);
}

/** Android back button / Esc: close the topmost overlay. Returns false if nothing was open. */
function closeTopmost(): boolean {
  const u = ui.get();
  if (u.menu) patchUi({ menu: null });
  else if (u.prompt) {
    u.prompt.resolve(null);
    patchUi({ prompt: null });
  } else if (u.exportOpen) patchUi({ exportOpen: false });
  else if (u.windows.length) patchUi({ windows: u.windows.slice(0, -1) });
  else if (u.browserOpen && window.innerWidth < 760) patchUi({ browserOpen: false });
  else if (u.view !== 'playlist') setView('playlist');
  else return false;
  return true;
}

function useShortcuts() {
  useEffect(() => {
    const held = new Set<string>();
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || (t.tagName === 'SELECT' && e.key !== ' ')) return;
      if (ui.get().prompt || ui.get().exportOpen) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const typing = ui.get().typingKeyboard;

      if (mod && k === 'z' && !e.shiftKey) return void (e.preventDefault(), project.undo());
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) return void (e.preventDefault(), project.redo());
      if (mod && k === 's') return void (e.preventDefault(), void saveNow());
      if (mod && k === 'r') return void (e.preventDefault(), patchUi({ exportOpen: true }));
      if (e.key === ' ') {
        e.preventDefault();
        if (!e.repeat) engine.togglePlay();
        return;
      }
      const fkeys: Record<string, ViewId> = { F5: 'playlist', F6: 'rack', F7: 'piano', F9: 'mixer' };
      if (fkeys[e.key]) return void (e.preventDefault(), setView(fkeys[e.key]));
      if (e.key === 'F8') return void (e.preventDefault(), patchUi({ browserOpen: !ui.get().browserOpen }));
      if (e.key === 'Escape') {
        const w = ui.get().windows;
        if (w.length) patchUi({ windows: w.slice(0, -1) });
        return;
      }
      if (mod || e.altKey) return;

      if (typing && k in KEYMAP) {
        e.preventDefault();
        if (held.has(k)) return;
        held.add(k);
        engine.noteOn(null, 60 + KEYMAP[k], 0.85);
        return;
      }
      if (typing) return;
      if (k === 'l') engine.setMode(engine.s.mode === 'song' ? 'pattern' : 'song');
      else if (k === 'r') void engine.armRecord(!engine.s.recordArmed);
      else if (k === 'p' || k === 'e' || k === 'd') {
        const tool = k === 'p' ? 'draw' : k === 'e' ? 'select' : 'erase';
        const u = ui.get();
        if (u.view === 'piano') patchUi({ piano: { ...u.piano, tool } });
        else if (u.view === 'playlist') patchUi({ playlist: { ...u.playlist, tool } });
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (held.has(k)) {
        held.delete(k);
        engine.noteOff(null, 60 + KEYMAP[k]);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
}

function EngineNotices() {
  const error = useEngine((s) => s.error);
  const ready = useEngine((s) => s.ready);
  const midi = useEngine((s) => s.midiInputs);
  useEffect(() => {
    if (midi.length) toast(`MIDI подключён: ${midi.join(', ')}`, 'success');
  }, [midi]);
  return (
    <>
      {error && (
        <div className="notice error" role="alert" onClick={() => engine.clearError()}>
          {error} <span className="dim">(нажмите, чтобы скрыть)</span>
        </div>
      )}
      {!ready && (
        <button className="audio-unlock" onClick={() => void engine.resume()}>
          <Icon name="power" size={16} /> Нажмите, чтобы включить звук
        </button>
      )}
    </>
  );
}

export function App() {
  useBoot();
  useShortcuts();
  const view = useUi((u) => u.view);
  const split = useUi((u) => u.split);
  const browserOpen = useUi((u) => u.browserOpen);
  const recording = useEngine((s) => s.recording);
  const booted = useUi((u) => u.booted);

  if (!booted) {
    return (
      <div className="splash" role="status">
        <span className="brand-mark">◢◣</span>
        <strong>Resonix Studio</strong>
        <span className="dim">Загрузка студии…</span>
      </div>
    );
  }

  return (
    <div className={cx('app', recording && 'is-recording')}>
      <TopBar />
      <div className="main">
        {browserOpen && <Browser />}
        {browserOpen && <div className="browser-scrim" onClick={() => patchUi({ browserOpen: false })} />}
        <div className="workspace">
          <nav className="tabs" aria-label="Окна">
            {VIEWS.map((v) => (
              <button key={v.id} className={cx('tab', view === v.id && 'on', split === v.id && 'split-on')} onClick={() => setView(v.id)} title={`${v.label} (${v.key})`}>
                <Icon name={v.icon} size={16} />
                <span>{v.label}</span>
              </button>
            ))}
            <div className="spacer" />
            <select
              className="split-select"
              value={split ?? ''}
              onChange={(e) => patchUi({ split: (e.target.value || null) as ViewId | null })}
              title="Второе окно снизу"
              aria-label="Второе окно"
            >
              <option value="">Одно окно</option>
              {VIEWS.filter((v) => v.id !== view).map((v) => (
                <option key={v.id} value={v.id}>
                  + {v.label}
                </option>
              ))}
            </select>
          </nav>
          <div className={cx('panes', split && 'is-split')}>
            <div className="pane">
              <View id={view} />
            </div>
            {split && split !== view && (
              <div className="pane">
                <View id={split} />
              </div>
            )}
          </div>
        </div>
      </div>
      <nav className="mobile-nav" aria-label="Разделы">
        <button className={cx(browserOpen && 'on')} onClick={() => patchUi({ browserOpen: !browserOpen })}>
          <Icon name="browser" />
          <span>Браузер</span>
        </button>
        {VIEWS.map((v) => (
          <button key={v.id} className={cx(view === v.id && 'on')} onClick={() => setView(v.id)}>
            <Icon name={v.icon} />
            <span>{v.label.replace('Channel ', '').replace(' Roll', '')}</span>
          </button>
        ))}
      </nav>
      <Windows />
      <ExportDialog />
      <ContextMenu />
      <PromptDialog />
      <Toasts />
      <EngineNotices />
    </div>
  );
}
