import { defaultParams, DRUM_PARAMS, EFFECT_DEFS, instrumentSpecs } from '../core/params';
import { paletteColor, ticksPerBar, uid } from '../core/music';
import {
  TICKS_PER_STEP,
  type AutomationClip,
  type AutomationTarget,
  type Channel,
  type EffectSlot,
  type EffectType,
  type InstrumentType,
  type MixerTrack,
  type Note,
  type ParamMap,
  type Pattern,
  type PatternClip,
  type PlaylistTrack,
  type Project,
} from '../core/types';

export const MIXER_INSERTS = 16;
export const PLAYLIST_TRACKS = 12;

export const SYNTH_PRESETS: Record<string, ParamMap> = {
  'Saw Lead': { osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', osc2Detune: 12, oscMix: 0.5, cutoff: 3800, resonance: 3, filterEnv: 0.3, attack: 0.005, decay: 0.3, sustain: 0.7, release: 0.25, glide: 0.04 },
  'Deep Bass': { osc1Wave: 'sawtooth', osc1Octave: -1, osc2Wave: 'square', osc2Octave: -1, osc2Detune: -5, oscMix: 0.35, subLevel: 0.6, cutoff: 420, resonance: 4, filterEnv: 0.45, filterDecay: 0.18, attack: 0.002, decay: 0.2, sustain: 0.8, release: 0.08, mono: true, glide: 0.03 },
  'Warm Pad': { osc1Wave: 'sawtooth', osc2Wave: 'sawtooth', osc2Detune: 14, oscMix: 0.5, cutoff: 1400, resonance: 1, filterEnv: 0.15, filterDecay: 1.5, attack: 0.6, decay: 1.2, sustain: 0.8, release: 1.6, lfoRate: 0.3, lfoDepth: 0.25, lfoTarget: 'cutoff', gain: 0.45 },
  'Pluck': { osc1Wave: 'square', osc2Wave: 'sawtooth', osc2Octave: 1, osc2Detune: 4, oscMix: 0.3, cutoff: 900, resonance: 5, filterEnv: 0.7, filterDecay: 0.16, attack: 0.002, decay: 0.28, sustain: 0.05, release: 0.25, gain: 0.55 },
  'Square Keys': { osc1Wave: 'square', osc2Wave: 'triangle', osc2Octave: 1, oscMix: 0.4, cutoff: 2600, resonance: 1.5, filterEnv: 0.25, filterDecay: 0.4, attack: 0.004, decay: 0.6, sustain: 0.4, release: 0.35 },
  'Sine Sub': { osc1Wave: 'sine', osc1Octave: -1, osc2Wave: 'sine', oscMix: 0, cutoff: 18000, resonance: 0.5, filterEnv: 0, attack: 0.004, decay: 0.3, sustain: 1, release: 0.12, mono: true },
};

export function makeChannel(type: InstrumentType, name: string, index: number, params: ParamMap = {}): Channel {
  return {
    id: uid('ch'),
    name,
    color: paletteColor(index),
    type,
    params: { ...defaultParams(instrumentSpecs(type)), ...params },
    volume: 0.8,
    pan: 0,
    mute: false,
    mixerTrack: 0,
    stepPitch: 60,
  };
}

export function makeDrumChannel(kind: string, index: number): Channel {
  const label = DRUM_PARAMS[0].kind === 'choice' ? DRUM_PARAMS[0].options.find((o) => o.value === kind)?.label : undefined;
  const extra: ParamMap = { kind };
  if (kind === 'hatClosed' || kind === 'hatOpen') extra.choke = 1;
  if (kind === 'bass808') extra.pitched = true;
  const ch = makeChannel('drum', label ?? kind, index, extra);
  if (kind === 'bass808') ch.stepPitch = 36;
  return ch;
}

export function makeSynthChannel(preset: string, index: number): Channel {
  return makeChannel('synth', preset, index, SYNTH_PRESETS[preset] ?? {});
}

export function makeSamplerChannel(sampleId: string, name: string, index: number): Channel {
  return makeChannel('sampler', name, index, { sampleId });
}

export function makeEffect(type: EffectType, params: ParamMap = {}): EffectSlot {
  return { id: uid('fx'), type, bypass: false, params: { ...defaultParams(EFFECT_DEFS[type].params), ...params } };
}

export function makeMixer(): MixerTrack[] {
  const tracks: MixerTrack[] = [
    { id: uid('mx'), name: 'Master', color: '#9aa3ad', volume: 0.8, pan: 0, mute: false, solo: false, effects: [] },
  ];
  for (let i = 1; i <= MIXER_INSERTS; i++) {
    tracks.push({ id: uid('mx'), name: `Insert ${i}`, color: paletteColor(i - 1), volume: 0.8, pan: 0, mute: false, solo: false, effects: [] });
  }
  return tracks;
}

export function makeTracks(count = PLAYLIST_TRACKS): PlaylistTrack[] {
  return Array.from({ length: count }, (_, i) => ({ id: uid('tr'), name: `Track ${i + 1}`, color: paletteColor(i + 4), mute: false }));
}

export function makePattern(index: number, bars = 1): Pattern {
  return { id: uid('pt'), name: `Pattern ${index + 1}`, color: paletteColor(index + 5), bars, notes: {} };
}

export function makeNote(pitch: number, start: number, length: number, velocity = 0.8): Note {
  return { id: uid('n'), pitch, start, length, velocity };
}

export function makePatternClip(trackId: string, patternId: string, start: number, length: number): PatternClip {
  return { id: uid('cl'), kind: 'pattern', trackId, patternId, start, length };
}

export function makeAutomationClip(trackId: string, target: AutomationTarget, name: string, start: number, length: number, value: number): AutomationClip {
  return {
    id: uid('cl'),
    kind: 'automation',
    trackId,
    name,
    target,
    start,
    length,
    points: [
      { t: 0, v: value },
      { t: length, v: value },
    ],
  };
}

export function emptyProject(name = 'Untitled'): Project {
  const now = Date.now();
  const pattern = makePattern(0);
  return {
    version: 1,
    id: uid('pr'),
    name,
    bpm: 128,
    timeSig: [4, 4],
    swing: 0,
    channels: [
      makeDrumChannel('kick', 0),
      makeDrumChannel('clap', 1),
      makeDrumChannel('hatClosed', 2),
      makeDrumChannel('snare', 3),
    ],
    patterns: [pattern],
    tracks: makeTracks(),
    clips: [],
    mixer: makeMixer(),
    samples: [],
    loop: null,
    createdAt: now,
    updatedAt: now,
  };
}

function steps(channel: Channel, pattern: Pattern, stepIdx: number[], velocity = 0.8): void {
  pattern.notes[channel.id] = stepIdx.map((s) => makeNote(channel.stepPitch, s * TICKS_PER_STEP, TICKS_PER_STEP, velocity));
}

/** A short, complete demo song so the studio makes sound on first launch. */
export function demoProject(): Project {
  const p = emptyProject('Demo — Night Drive');
  p.bpm = 124;
  const S = TICKS_PER_STEP;

  const kick = makeDrumChannel('kick', 0);
  const clap = makeDrumChannel('clap', 1);
  const hat = makeDrumChannel('hatClosed', 2);
  const ohat = makeDrumChannel('hatOpen', 3);
  const pluck = makeSynthChannel('Pluck', 6);
  const bass = makeSynthChannel('Deep Bass', 4);
  const pad = makeSynthChannel('Warm Pad', 7);
  p.channels = [kick, clap, hat, ohat, bass, pluck, pad];
  p.channels.forEach((c, i) => {
    c.mixerTrack = i + 1;
    p.mixer[i + 1].name = c.name;
    p.mixer[i + 1].color = c.color;
  });
  hat.volume = 0.55;
  ohat.volume = 0.5;
  pad.volume = 0.55;

  const drums = makePattern(0, 1);
  drums.name = 'Drums';
  steps(kick, drums, [0, 4, 8, 12], 0.95);
  steps(clap, drums, [4, 12], 0.85);
  steps(hat, drums, [0, 1, 3, 4, 5, 7, 8, 9, 11, 12, 13, 15], 0.6);
  drums.notes[hat.id].forEach((n, i) => (n.velocity = i % 3 === 1 ? 0.75 : 0.45));
  steps(ohat, drums, [2, 6, 10, 14], 0.6);

  // i–VI–III–VII in A minor, one chord per bar.
  const chords = [
    [57, 60, 64],
    [53, 57, 60],
    [48, 52, 55],
    [55, 59, 62],
  ];
  const bar = ticksPerBar(p.timeSig);

  const lead = makePattern(1, 4);
  lead.name = 'Pluck';
  lead.notes[pluck.id] = [];
  const rhythm = [0, 3, 6, 8, 10, 13];
  chords.forEach((chord, ci) => {
    rhythm.forEach((st, ri) => {
      const pitch = chord[ri % 3] + 12;
      lead.notes[pluck.id].push(makeNote(pitch, ci * bar + st * S, S * 2, ri === 0 ? 0.9 : 0.7));
    });
  });

  const bassPat = makePattern(2, 4);
  bassPat.name = 'Bass';
  bassPat.notes[bass.id] = [];
  chords.forEach((chord, ci) => {
    [0, 6, 10, 14].forEach((st, i) => {
      bassPat.notes[bass.id].push(makeNote(chord[0] - 12, ci * bar + st * S, i === 0 ? S * 5 : S * 2, i === 0 ? 0.9 : 0.75));
    });
  });

  const padPat = makePattern(3, 4);
  padPat.name = 'Pad';
  padPat.notes[pad.id] = [];
  chords.forEach((chord, ci) => {
    chord.forEach((pitch) => padPat.notes[pad.id].push(makeNote(pitch, ci * bar, bar, 0.6)));
  });

  p.patterns = [drums, lead, bassPat, padPat];

  const [t1, t2, t3, t4, t5] = p.tracks;
  t1.name = 'Drums';
  t2.name = 'Pluck';
  t3.name = 'Bass';
  t4.name = 'Pad';
  t5.name = 'Filter sweep';
  p.clips = [
    makePatternClip(t1.id, drums.id, 4 * bar, 12 * bar),
    makePatternClip(t2.id, lead.id, 0, 4 * bar),
    makePatternClip(t2.id, lead.id, 4 * bar, 4 * bar),
    makePatternClip(t2.id, lead.id, 8 * bar, 4 * bar),
    makePatternClip(t2.id, lead.id, 12 * bar, 4 * bar),
    makePatternClip(t3.id, bassPat.id, 4 * bar, 4 * bar),
    makePatternClip(t3.id, bassPat.id, 8 * bar, 4 * bar),
    makePatternClip(t3.id, bassPat.id, 12 * bar, 4 * bar),
    makePatternClip(t4.id, padPat.id, 8 * bar, 4 * bar),
    makePatternClip(t4.id, padPat.id, 12 * bar, 4 * bar),
  ];
  const sweep = makeAutomationClip(t5.id, { scope: 'channel', channelId: pluck.id, param: 'cutoff' }, 'Pluck cutoff', 0, 4 * bar, 0.2);
  sweep.points = [
    { t: 0, v: 0.12 },
    { t: 4 * bar, v: 0.62 },
  ];
  p.clips.push(sweep);

  p.mixer[6].effects = [makeEffect('delay', { mix: 0.22 }), makeEffect('reverb', { mix: 0.3 })];
  p.mixer[7].effects = [makeEffect('chorus', { mix: 0.4 }), makeEffect('reverb', { mix: 0.35, size: 4 })];
  p.mixer[5].effects = [makeEffect('distortion', { drive: 0.25, mix: 0.5 })];
  p.mixer[1].effects = [makeEffect('compressor', { threshold: -14, ratio: 4 })];
  p.mixer[0].effects = [makeEffect('eq3'), makeEffect('limiter')];
  return p;
}
