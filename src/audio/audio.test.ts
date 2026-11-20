import { describe, expect, it } from 'vitest';
import { PPQ, TICKS_PER_STEP, type AutomationClip, type Project } from '../core/types';
import { ticksPerBar } from '../core/music';
import { demoProject, emptyProject, makeAutomationClip, makeNote, makePatternClip } from '../project/factory';
import { automationAt, automationValue, collectAudioCovering, collectAudioStarts, collectNotes, swingOffset, targetKey } from './events';
import { delaySeconds } from './effects';
import { computePeaks, encodeWav } from './wav';

function withNotes(): Project {
  const p = emptyProject();
  const pat = p.patterns[0];
  const kick = p.channels[0];
  pat.notes[kick.id] = [makeNote(60, 0, TICKS_PER_STEP), makeNote(60, 8 * TICKS_PER_STEP, TICKS_PER_STEP)];
  return p;
}

describe('collectNotes — pattern mode', () => {
  it('returns notes inside the range', () => {
    const p = withNotes();
    const ev = collectNotes(p, 'pattern', p.patterns[0].id, 0, TICKS_PER_STEP * 4);
    expect(ev.map((e) => e.tick)).toEqual([0]);
  });

  it('loops the pattern beyond its length', () => {
    const p = withNotes();
    const bar = ticksPerBar(p.timeSig);
    const ev = collectNotes(p, 'pattern', p.patterns[0].id, bar, bar * 2);
    expect(ev.map((e) => e.tick)).toEqual([bar, bar + 8 * TICKS_PER_STEP]);
  });

  it('applies swing to off-beat 16ths only', () => {
    expect(swingOffset(0, 1)).toBe(0);
    expect(swingOffset(TICKS_PER_STEP, 1)).toBeGreaterThan(0);
    expect(swingOffset(TICKS_PER_STEP * 2, 1)).toBe(0);
    const p = withNotes();
    p.swing = 0.5;
    p.patterns[0].notes[p.channels[1].id] = [makeNote(60, TICKS_PER_STEP, TICKS_PER_STEP)];
    const ev = collectNotes(p, 'pattern', p.patterns[0].id, 0, TICKS_PER_STEP * 2);
    expect(ev.find((e) => e.channelId === p.channels[1].id)!.tick).toBeGreaterThan(TICKS_PER_STEP);
  });
});

describe('collectNotes — song mode', () => {
  it('plays clips at their position and repeats patterns inside long clips', () => {
    const p = withNotes();
    const bar = ticksPerBar(p.timeSig);
    p.clips.push(makePatternClip(p.tracks[0].id, p.patterns[0].id, bar * 2, bar * 2));
    const ev = collectNotes(p, 'song', null, 0, bar * 8);
    expect(ev.map((e) => e.tick)).toEqual([bar * 2, bar * 2 + 8 * TICKS_PER_STEP, bar * 3, bar * 3 + 8 * TICKS_PER_STEP]);
  });

  it('truncates notes at the clip end', () => {
    const p = withNotes();
    p.patterns[0].notes[p.channels[0].id] = [makeNote(60, 0, PPQ * 8)];
    p.clips.push(makePatternClip(p.tracks[0].id, p.patterns[0].id, 0, PPQ));
    const [ev] = collectNotes(p, 'song', null, 0, PPQ * 4);
    expect(ev.length).toBe(PPQ);
  });

  it('skips muted playlist tracks', () => {
    const p = withNotes();
    p.clips.push(makePatternClip(p.tracks[0].id, p.patterns[0].id, 0, PPQ * 4));
    p.tracks[0].mute = true;
    expect(collectNotes(p, 'song', null, 0, PPQ * 4)).toHaveLength(0);
  });

  it('partitions a song into chunks without losing or duplicating notes', () => {
    const p = demoProject();
    const end = PPQ * 4 * 16;
    const whole = collectNotes(p, 'song', null, 0, end).length;
    let chunked = 0;
    for (let t = 0; t < end; t += TICKS_PER_STEP) chunked += collectNotes(p, 'song', null, t, t + TICKS_PER_STEP).length;
    expect(chunked).toBe(whole);
    expect(whole).toBeGreaterThan(100);
  });
});

describe('audio clips', () => {
  it('starts clips at their start and when entering mid-clip', () => {
    const p = emptyProject();
    p.clips.push({ id: 'a', kind: 'audio', trackId: p.tracks[0].id, start: 100, length: 200, sampleId: 's', offset: 0, gain: 1, mixerTrack: 0 });
    expect(collectAudioStarts(p, 0, 100)).toHaveLength(0);
    expect(collectAudioStarts(p, 100, 101)).toHaveLength(1);
    const cov = collectAudioCovering(p, 150);
    expect(cov).toHaveLength(1);
    expect(cov[0].intoClip).toBe(50);
    expect(collectAudioCovering(p, 100)).toHaveLength(0);
  });
});

describe('automation', () => {
  const clip = (): AutomationClip => {
    const c = makeAutomationClip('t', { scope: 'mixer', trackIndex: 0, param: 'volume' }, 'x', 0, 100, 0);
    c.points = [
      { t: 0, v: 0 },
      { t: 50, v: 1 },
      { t: 100, v: 0.5 },
    ];
    return c;
  };

  it('interpolates linearly and holds at the ends', () => {
    const c = clip();
    expect(automationValue(c, -10)).toBe(0);
    expect(automationValue(c, 25)).toBeCloseTo(0.5);
    expect(automationValue(c, 75)).toBeCloseTo(0.75);
    expect(automationValue(c, 500)).toBe(0.5);
  });

  it('finds the value covering a tick by target', () => {
    const p = emptyProject();
    const c = clip();
    c.trackId = p.tracks[0].id;
    c.start = 1000;
    p.clips.push(c);
    const key = targetKey(c.target);
    expect(automationAt(p, key, 999)).toBeNull();
    expect(automationAt(p, key, 1025)).toBeCloseTo(0.5);
    p.tracks[0].mute = true;
    expect(automationAt(p, key, 1025)).toBeNull();
  });
});

describe('tempo-synced delay', () => {
  it('converts note values to seconds', () => {
    expect(delaySeconds('1/4', 0, 120)).toBeCloseTo(0.5);
    expect(delaySeconds('1/8d', 0, 120)).toBeCloseTo(0.375);
    expect(delaySeconds('free', 250, 120)).toBeCloseTo(0.25);
  });
});

describe('WAV encoder', () => {
  const read = (buf: ArrayBuffer) => new DataView(buf);

  it('writes a valid 16-bit header and clamps samples', () => {
    const l = new Float32Array([0, 1, -1, 2]);
    const r = new Float32Array([0.5, -0.5, 0, -2]);
    const v = read(encodeWav([l, r], 44100, 16));
    const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(v.getUint16(20, true)).toBe(1);
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(40, true)).toBe(4 * 2 * 2);
    expect(v.getInt16(44 + 4, true)).toBe(32767); // L[1] = 1
    expect(v.getInt16(44 + 8, true)).toBe(-32768); // L[2] = -1
    expect(v.getInt16(44 + 12, true)).toBe(32767); // L[3] clamped
  });

  it('writes 24-bit and float formats', () => {
    const d = new Float32Array([0.5]);
    const v24 = read(encodeWav([d], 48000, 24));
    const x = v24.getUint8(44) | (v24.getUint8(45) << 8) | (v24.getInt8(46) << 16);
    expect(x).toBe(Math.round(0.5 * 0x7fffff));
    const v32 = read(encodeWav([d], 48000, 32));
    expect(v32.getUint16(20, true)).toBe(3);
    expect(v32.getFloat32(44, true)).toBeCloseTo(0.5);
  });

  it('computes peaks per bucket', () => {
    const p = computePeaks([new Float32Array([0, 0.2, -0.9, 0.1])], 2);
    expect(Array.from(p).map((x) => +x.toFixed(2))).toEqual([0.2, 0.9]);
  });
});
