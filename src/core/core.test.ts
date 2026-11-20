import { describe, expect, it } from 'vitest';
import { formatPosition, noteName, secondsPerTick, snapTick, songLengthTicks, ticksPerBar, ticksToSeconds } from './music';
import { fromNormalized, toNormalized, type NumberParamSpec } from './params';
import { HistoryStore } from './store';
import { PPQ } from './types';
import { emptyProject, makePatternClip } from '../project/factory';

describe('music', () => {
  it('converts ticks and seconds at a tempo', () => {
    expect(ticksToSeconds(PPQ, 120)).toBeCloseTo(0.5);
    expect(secondsPerTick(60) * PPQ).toBeCloseTo(1);
  });

  it('computes bar lengths for odd meters', () => {
    expect(ticksPerBar([4, 4])).toBe(PPQ * 4);
    expect(ticksPerBar([6, 8])).toBe(PPQ * 3);
    expect(ticksPerBar([7, 8])).toBe((PPQ * 7) / 2);
  });

  it('formats FL-style positions', () => {
    expect(formatPosition(0, [4, 4])).toBe('1:1:01');
    expect(formatPosition(PPQ * 4 + PPQ + PPQ / 4, [4, 4])).toBe('2:2:02');
  });

  it('names notes with C5 = 60', () => {
    expect(noteName(60)).toBe('C5');
    expect(noteName(69)).toBe('A5');
  });

  it('snaps ticks', () => {
    expect(snapTick(35, 24)).toBe(24);
    expect(snapTick(37, 24)).toBe(48);
    expect(snapTick(47, 24, 'floor')).toBe(24);
    expect(snapTick(13.4, 1)).toBe(13);
  });

  it('measures song length to whole bars', () => {
    const p = emptyProject();
    expect(songLengthTicks(p)).toBe(ticksPerBar(p.timeSig));
    p.clips.push(makePatternClip(p.tracks[0].id, p.patterns[0].id, PPQ * 4 * 2, PPQ));
    expect(songLengthTicks(p)).toBe(PPQ * 4 * 3);
  });
});

describe('param normalisation', () => {
  const lin: NumberParamSpec = { kind: 'number', key: 'a', label: 'a', min: -1, max: 1, default: 0 };
  const exp: NumberParamSpec = { kind: 'number', key: 'f', label: 'f', min: 20, max: 20000, default: 1000, curve: 'exp' };
  const cub: NumberParamSpec = { kind: 'number', key: 'v', label: 'v', min: 0, max: 1.25, default: 0.8, curve: 'cubic' };

  it('round-trips every curve', () => {
    for (const spec of [lin, exp, cub]) {
      for (const n of [0, 0.25, 0.5, 0.9, 1]) expect(toNormalized(spec, fromNormalized(spec, n))).toBeCloseTo(n, 6);
    }
  });

  it('maps exp curves geometrically', () => {
    expect(fromNormalized(exp, 0.5)).toBeCloseTo(Math.sqrt(20 * 20000), 3);
  });

  it('clamps out-of-range input', () => {
    expect(toNormalized(lin, 5)).toBe(1);
    expect(fromNormalized(lin, -3)).toBe(-1);
  });
});

describe('HistoryStore', () => {
  it('undoes and redoes edits', () => {
    const s = new HistoryStore({ n: 0 });
    s.edit((d) => void (d.n = 1));
    s.edit((d) => void (d.n = 2));
    s.undo();
    expect(s.get().n).toBe(1);
    s.undo();
    expect(s.get().n).toBe(0);
    s.redo();
    expect(s.get().n).toBe(1);
  });

  it('coalesces a gesture into one undo step', () => {
    const s = new HistoryStore({ n: 0 });
    for (let i = 1; i <= 10; i++) s.edit((d) => void (d.n = i), 'drag-1');
    expect(s.get().n).toBe(10);
    s.undo();
    expect(s.get().n).toBe(0);
    expect(s.canUndo()).toBe(false);
  });

  it('starts a new step after breakCoalescing', () => {
    const s = new HistoryStore({ n: 0 });
    s.edit((d) => void (d.n = 1), 'k');
    s.breakCoalescing();
    s.edit((d) => void (d.n = 2), 'k');
    s.undo();
    expect(s.get().n).toBe(1);
  });

  it('ignores no-op edits and clears redo on new edits', () => {
    const s = new HistoryStore({ n: 0 });
    s.edit(() => {});
    expect(s.canUndo()).toBe(false);
    s.edit((d) => void (d.n = 1));
    s.undo();
    s.edit((d) => void (d.n = 5));
    expect(s.canRedo()).toBe(false);
  });
});
