// Shared UI state for the 3D scene and the page. Kept outside React so the
// render loop can read it every frame without re-rendering components.

import { useSyncExternalStore } from 'react';
import type { PlanetId } from '../data/planets';

export interface SceneState {
  /** Planet the camera is following (interactive mode). */
  selected: PlanetId | null;
  hovered: PlanetId | null;
  /** Planet open in the detail dialog. */
  modal: PlanetId | null;
  /** The dialog grew out of a planet card (shared-element animation). */
  modalFromCard: boolean;
  /** "Watch Universe": UI hidden, camera tours the system. */
  cinematic: boolean;
  /** Orbital speed multiplier; 0 = paused. */
  speed: number;
  labels: boolean;
  /** User zoom multiplier on top of the automatic framing. */
  zoom: number;
  /** Bumped to make the camera return to the overview framing. */
  resetToken: number;
}

type Listener = () => void;

let state: SceneState = {
  selected: null,
  hovered: null,
  modal: null,
  modalFromCard: false,
  cinematic: false,
  speed: 1,
  labels: false,
  zoom: 1,
  resetToken: 0,
};
const listeners = new Set<Listener>();

export const scene = {
  get: (): SceneState => state,
  set(patch: Partial<SceneState>): void {
    const next = { ...state, ...patch };
    if (Object.keys(patch).every((k) => next[k as keyof SceneState] === state[k as keyof SceneState])) return;
    state = next;
    for (const l of listeners) l();
  },
  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useScene<T>(select: (s: SceneState) => T): T {
  return useSyncExternalStore(scene.subscribe, () => select(state), () => select(state));
}

export function selectPlanet(id: PlanetId | null): void {
  scene.set({ selected: id, zoom: 1 });
}

export function resetView(): void {
  scene.set({ selected: null, zoom: 1, resetToken: state.resetToken + 1 });
}

export function scrollToId(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/** Bring the hero into view and fly the camera to a planet. */
export function showInSystem(id: PlanetId): void {
  scene.set({ modal: null, cinematic: false });
  scrollToId('overview');
  selectPlanet(id);
}
