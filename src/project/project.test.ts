import { describe, expect, it } from 'vitest';
import { PPQ, type Project } from '../core/types';
import { demoProject } from './factory';
import { sanitizeProject } from './file';
import { readMidi, writeMidi } from './midi';

describe('MIDI files', () => {
  it('round-trips notes, tempo and meter', () => {
    const bytes = writeMidi({
      bpm: 128,
      timeSig: [3, 4],
      tracks: [
        { name: 'Lead', notes: [{ pitch: 60, start: 0, length: PPQ, velocity: 1 }, { pitch: 64, start: PPQ, length: PPQ / 2, velocity: 0.5 }] },
        { name: 'Bass', notes: [{ pitch: 36, start: PPQ * 2, length: PPQ * 2, velocity: 0.8 }] },
      ],
    });
    const back = readMidi(bytes);
    expect(back.bpm).toBe(128);
    expect(back.timeSig).toEqual([3, 4]);
    expect(back.tracks.map((t) => t.name)).toEqual(['Lead', 'Bass']);
    expect(back.tracks[0].notes).toHaveLength(2);
    expect(back.tracks[0].notes[1]).toMatchObject({ pitch: 64, start: PPQ, length: PPQ / 2 });
    expect(back.tracks[0].notes[1].velocity).toBeCloseTo(0.5, 1);
    expect(back.tracks[1].notes[0]).toMatchObject({ pitch: 36, start: PPQ * 2, length: PPQ * 2 });
  });

  it('rejects non-MIDI data', () => {
    expect(() => readMidi(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toThrow();
  });
});

describe('sanitizeProject', () => {
  it('keeps a valid project intact', () => {
    const p = demoProject();
    const s = sanitizeProject(JSON.parse(JSON.stringify(p)));
    expect(s.channels).toHaveLength(p.channels.length);
    expect(s.clips).toHaveLength(p.clips.length);
    expect(s.mixer[6].effects.map((e) => e.type)).toEqual(['delay', 'reverb']);
  });

  it('repairs malformed data', () => {
    const s = sanitizeProject({ name: 42, bpm: 'fast', channels: [{ type: 'bogus' }, { type: 'drum', volume: 99 }], clips: [{ trackId: 'missing', length: 5 }] } as unknown as Project);
    expect(s.name).toBe('Untitled');
    expect(s.bpm).toBe(120);
    expect(s.channels).toHaveLength(1);
    expect(s.channels[0].volume).toBe(1.25);
    expect(s.channels[0].params.kind).toBe('kick');
    expect(s.clips).toHaveLength(0);
    expect(s.patterns).toHaveLength(1);
    expect(s.mixer.length).toBeGreaterThan(1);
  });
});
