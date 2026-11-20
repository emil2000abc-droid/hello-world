import { produce, type Draft } from 'immer';
import { useSyncExternalStore } from 'react';

type Listener = () => void;

/** Minimal observable store; components subscribe with selectors. */
export class Store<T> {
  protected state: T;
  private listeners = new Set<Listener>();

  constructor(initial: T) {
    this.state = initial;
  }

  get = (): T => this.state;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  protected emit(): void {
    for (const l of [...this.listeners]) l();
  }

  set(next: T): void {
    if (next === this.state) return;
    this.state = next;
    this.emit();
  }

  update(recipe: (draft: Draft<T>) => void): void {
    this.set(produce(this.state, recipe));
  }
}

export function useStore<T, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()), () => selector(store.get()));
}

const HISTORY_LIMIT = 200;
const COALESCE_MS = 1200;

/**
 * Store with undo/redo. Edits that share a `coalesce` key within a short
 * window collapse into a single undo step (knob drags, note drags).
 */
export class HistoryStore<T> extends Store<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastKey: string | null = null;
  private lastTime = 0;
  private historyListeners = new Set<Listener>();

  edit(recipe: (draft: Draft<T>) => void, coalesce?: string): void {
    const next = produce(this.state, recipe);
    if (next === this.state) return;
    const now = Date.now();
    const merge = coalesce !== undefined && coalesce === this.lastKey && now - this.lastTime < COALESCE_MS;
    if (!merge) {
      this.past.push(this.state);
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
      this.future = [];
    }
    this.lastKey = coalesce ?? null;
    this.lastTime = now;
    this.set(next);
    this.emitHistory();
  }

  /** Replace state without touching history (loading, engine-side updates). */
  replace(next: T, clearHistory = false): void {
    if (clearHistory) {
      this.past = [];
      this.future = [];
    }
    this.lastKey = null;
    this.set(next);
    this.emitHistory();
  }

  /** Ends the current coalescing run so the next edit starts a new undo step. */
  breakCoalescing(): void {
    this.lastKey = null;
  }

  undo(): void {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.state);
    this.lastKey = null;
    this.set(prev);
    this.emitHistory();
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.state);
    this.lastKey = null;
    this.set(next);
    this.emitHistory();
  }

  canUndo = (): boolean => this.past.length > 0;
  canRedo = (): boolean => this.future.length > 0;

  subscribeHistory = (l: Listener): (() => void) => {
    this.historyListeners.add(l);
    return () => this.historyListeners.delete(l);
  };

  private emitHistory(): void {
    for (const l of [...this.historyListeners]) l();
  }
}
