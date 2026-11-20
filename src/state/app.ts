// Application-wide stores: the project (with undo history), UI state, and
// the audio engine singleton.

import { AudioEngine } from '../audio/engine';
import { HistoryStore, Store, useStore } from '../core/store';
import type { ID, Project } from '../core/types';
import { demoProject } from '../project/factory';

export type ViewId = 'playlist' | 'rack' | 'piano' | 'mixer';

export type WindowRef =
  | { kind: 'channel'; channelId: ID }
  | { kind: 'effect'; trackIndex: number; effectId: ID }
  | { kind: 'automation'; clipId: ID };

export type PianoTool = 'draw' | 'select' | 'erase' | 'scroll';
export type PlaylistTool = 'draw' | 'select' | 'erase' | 'slice';

export interface MenuItem {
  label: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  separator?: boolean;
  hint?: string;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

export interface UiState {
  /** False until the last session has been restored. */
  booted: boolean;
  view: ViewId;
  /** Second pane on wide screens (null = single pane). */
  split: ViewId | null;
  browserOpen: boolean;
  currentPatternId: ID | null;
  selectedChannelId: ID | null;
  selectedMixerTrack: number;
  /** Playlist track that receives audio recordings and drawn clips. */
  selectedTrackId: ID | null;
  windows: WindowRef[];
  piano: { tool: PianoTool; snap: number; zoomX: number; zoomY: number; selection: ID[]; ghost: boolean };
  playlist: { tool: PlaylistTool; snap: number; zoomX: number; selection: ID[]; brush: { kind: 'pattern' | 'audio'; id: ID } | null };
  typingKeyboard: boolean;
  menu: { x: number; y: number; items: MenuItem[] } | null;
  prompt: { title: string; value: string; resolve: (v: string | null) => void } | null;
  toasts: Toast[];
  exportOpen: boolean;
  saveStatus: 'saved' | 'dirty' | 'saving' | 'error';
}

export const project = new HistoryStore<Project>(demoProject());

const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export const ui = new Store<UiState>({
  booted: false,
  view: 'playlist',
  split: null,
  browserOpen: true,
  currentPatternId: null,
  selectedChannelId: null,
  selectedMixerTrack: 1,
  selectedTrackId: null,
  windows: [],
  piano: { tool: 'draw', snap: 24, zoomX: coarse ? 1.3 : 1, zoomY: coarse ? 1.6 : 1, selection: [], ghost: true },
  playlist: { tool: 'draw', snap: 96 * 4, zoomX: 1, selection: [], brush: null },
  typingKeyboard: false,
  menu: null,
  prompt: null,
  toasts: [],
  exportOpen: false,
  saveStatus: 'saved',
});

export const engine = new AudioEngine();

export function useProject<S>(selector: (p: Project) => S): S {
  return useStore(project, selector);
}

export function useUi<S>(selector: (u: UiState) => S): S {
  return useStore(ui, selector);
}

export function useEngine<S>(selector: (s: ReturnType<typeof engine.state.get>) => S): S {
  return useStore(engine.state, selector);
}

export function patchUi(p: Partial<UiState>): void {
  ui.set({ ...ui.get(), ...p });
}

let toastId = 0;
export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  const id = ++toastId;
  patchUi({ toasts: [...ui.get().toasts, { id, text, kind }] });
  setTimeout(() => patchUi({ toasts: ui.get().toasts.filter((t) => t.id !== id) }), kind === 'error' ? 6000 : 3200);
}

export function openMenu(x: number, y: number, items: MenuItem[]): void {
  patchUi({ menu: { x, y, items } });
}

export function closeMenu(): void {
  if (ui.get().menu) patchUi({ menu: null });
}

export function askText(title: string, value = ''): Promise<string | null> {
  return new Promise((resolve) => patchUi({ prompt: { title, value, resolve } }));
}

export function openWindow(w: WindowRef): void {
  const key = JSON.stringify(w);
  const rest = ui.get().windows.filter((x) => JSON.stringify(x) !== key);
  patchUi({ windows: [...rest, w] });
}

export function closeWindow(w: WindowRef): void {
  const key = JSON.stringify(w);
  patchUi({ windows: ui.get().windows.filter((x) => JSON.stringify(x) !== key) });
}

export function setView(view: ViewId): void {
  const s = ui.get();
  patchUi({ view, split: s.split === view ? null : s.split });
}

/** The pattern being edited; falls back to the first pattern. */
export function currentPatternId(): ID | null {
  const p = project.get();
  const id = ui.get().currentPatternId;
  return p.patterns.some((x) => x.id === id) ? id : (p.patterns[0]?.id ?? null);
}

export function useCurrentPatternId(): ID | null {
  const id = useUi((u) => u.currentPatternId);
  const patterns = useProject((p) => p.patterns);
  return patterns.some((x) => x.id === id) ? id : (patterns[0]?.id ?? null);
}

export function useSelectedChannelId(): ID | null {
  const id = useUi((u) => u.selectedChannelId);
  const channels = useProject((p) => p.channels);
  return channels.some((c) => c.id === id) ? id : (channels[0]?.id ?? null);
}

export function selectedChannelId(): ID | null {
  const id = ui.get().selectedChannelId;
  const chs = project.get().channels;
  return chs.some((c) => c.id === id) ? id : (chs[0]?.id ?? null);
}
