// Parameter descriptors shared by instruments and effects. The UI renders
// controls from them, the engine reads values, and automation uses them to
// map between normalised 0..1 values and real units.

import type { EffectType, InstrumentType, ParamMap, ParamValue } from './types';

export interface NumberParamSpec {
  kind: 'number';
  key: string;
  label: string;
  min: number;
  max: number;
  default: number;
  /** 'exp' for frequencies and times, 'cubic' for gain faders, so controls feel musical. */
  curve?: 'linear' | 'exp' | 'cubic';
  unit?: string;
  /** Round to this step. */
  step?: number;
  /** Can be driven by automation clips. */
  automatable?: boolean;
  group?: string;
}

export interface ChoiceParamSpec {
  kind: 'choice';
  key: string;
  label: string;
  options: { value: string; label: string }[];
  default: string;
  group?: string;
}

export interface BoolParamSpec {
  kind: 'bool';
  key: string;
  label: string;
  default: boolean;
  group?: string;
}

export type ParamSpec = NumberParamSpec | ChoiceParamSpec | BoolParamSpec;

export function toNormalized(spec: NumberParamSpec, value: number): number {
  const v = Math.min(spec.max, Math.max(spec.min, value));
  if (spec.curve === 'exp' && spec.min > 0) {
    return Math.log(v / spec.min) / Math.log(spec.max / spec.min);
  }
  const lin = (v - spec.min) / (spec.max - spec.min);
  return spec.curve === 'cubic' ? Math.cbrt(lin) : lin;
}

export function fromNormalized(spec: NumberParamSpec, n: number): number {
  const c = Math.min(1, Math.max(0, n));
  let v: number;
  if (spec.curve === 'exp' && spec.min > 0) v = spec.min * Math.pow(spec.max / spec.min, c);
  else if (spec.curve === 'cubic') v = spec.min + c * c * c * (spec.max - spec.min);
  else v = spec.min + c * (spec.max - spec.min);
  if (spec.step) v = Math.round(v / spec.step) * spec.step;
  return v;
}

export function formatParam(spec: NumberParamSpec, value: number): string {
  const unit = spec.unit ?? '';
  if (unit === 'Hz' && value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)} kHz`;
  if (unit === 's' && value < 1) return `${Math.round(value * 1000)} ms`;
  if (unit === '%') return `${Math.round(value * 100)}%`;
  const digits = spec.step && spec.step >= 1 ? 0 : Math.abs(value) >= 100 ? 0 : Math.abs(value) >= 10 ? 1 : 2;
  return `${value.toFixed(digits)}${unit ? ' ' + unit : ''}`;
}

export function defaultParams(specs: ParamSpec[]): ParamMap {
  const out: ParamMap = {};
  for (const s of specs) out[s.key] = s.default;
  return out;
}

export function num(params: ParamMap, key: string, fallback = 0): number {
  const v = params[key];
  return typeof v === 'number' ? v : fallback;
}

export function str(params: ParamMap, key: string, fallback = ''): string {
  const v = params[key];
  return typeof v === 'string' ? v : fallback;
}

export function bool(params: ParamMap, key: string, fallback = false): boolean {
  const v = params[key];
  return typeof v === 'boolean' ? v : fallback;
}

export function isParamValue(v: unknown): v is ParamValue {
  return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean';
}

const WAVES = [
  { value: 'sawtooth', label: 'Saw' },
  { value: 'square', label: 'Square' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'sine', label: 'Sine' },
];

// ---------------------------------------------------------------- instruments

export const SYNTH_PARAMS: ParamSpec[] = [
  { kind: 'choice', key: 'osc1Wave', label: 'Osc 1', options: WAVES, default: 'sawtooth', group: 'Oscillators' },
  { kind: 'number', key: 'osc1Octave', label: 'Oct 1', min: -3, max: 3, step: 1, default: 0, group: 'Oscillators' },
  { kind: 'number', key: 'osc1Detune', label: 'Fine 1', min: -100, max: 100, step: 1, default: 0, unit: 'ct', group: 'Oscillators' },
  { kind: 'choice', key: 'osc2Wave', label: 'Osc 2', options: WAVES, default: 'square', group: 'Oscillators' },
  { kind: 'number', key: 'osc2Octave', label: 'Oct 2', min: -3, max: 3, step: 1, default: 0, group: 'Oscillators' },
  { kind: 'number', key: 'osc2Detune', label: 'Fine 2', min: -100, max: 100, step: 1, default: 7, unit: 'ct', group: 'Oscillators' },
  { kind: 'number', key: 'oscMix', label: 'Mix', min: 0, max: 1, default: 0.4, unit: '%', group: 'Oscillators' },
  { kind: 'number', key: 'subLevel', label: 'Sub', min: 0, max: 1, default: 0, unit: '%', group: 'Oscillators' },
  { kind: 'choice', key: 'filterType', label: 'Filter', options: [
    { value: 'lowpass', label: 'Low-pass' },
    { value: 'highpass', label: 'High-pass' },
    { value: 'bandpass', label: 'Band-pass' },
  ], default: 'lowpass', group: 'Filter' },
  { kind: 'number', key: 'cutoff', label: 'Cutoff', min: 40, max: 18000, default: 2400, curve: 'exp', unit: 'Hz', automatable: true, group: 'Filter' },
  { kind: 'number', key: 'resonance', label: 'Reso', min: 0.1, max: 18, default: 2, curve: 'exp', group: 'Filter' },
  { kind: 'number', key: 'filterEnv', label: 'Env amt', min: 0, max: 1, default: 0.35, unit: '%', group: 'Filter' },
  { kind: 'number', key: 'filterDecay', label: 'Env dec', min: 0.01, max: 4, default: 0.35, curve: 'exp', unit: 's', group: 'Filter' },
  { kind: 'number', key: 'attack', label: 'Attack', min: 0.001, max: 4, default: 0.005, curve: 'exp', unit: 's', group: 'Amp' },
  { kind: 'number', key: 'decay', label: 'Decay', min: 0.01, max: 4, default: 0.25, curve: 'exp', unit: 's', group: 'Amp' },
  { kind: 'number', key: 'sustain', label: 'Sustain', min: 0, max: 1, default: 0.7, unit: '%', group: 'Amp' },
  { kind: 'number', key: 'release', label: 'Release', min: 0.01, max: 6, default: 0.2, curve: 'exp', unit: 's', group: 'Amp' },
  { kind: 'number', key: 'lfoRate', label: 'LFO rate', min: 0.05, max: 20, default: 4, curve: 'exp', unit: 'Hz', automatable: true, group: 'LFO' },
  { kind: 'number', key: 'lfoDepth', label: 'LFO depth', min: 0, max: 1, default: 0, unit: '%', automatable: true, group: 'LFO' },
  { kind: 'choice', key: 'lfoTarget', label: 'LFO to', options: [
    { value: 'cutoff', label: 'Cutoff' },
    { value: 'pitch', label: 'Pitch' },
  ], default: 'cutoff', group: 'LFO' },
  { kind: 'number', key: 'glide', label: 'Glide', min: 0, max: 1, default: 0, unit: 's', group: 'Voice' },
  { kind: 'bool', key: 'mono', label: 'Mono', default: false, group: 'Voice' },
  { kind: 'number', key: 'gain', label: 'Level', min: 0, max: 1, default: 0.6, unit: '%', group: 'Voice' },
];

export const DRUM_KINDS = [
  { value: 'kick', label: 'Kick' },
  { value: 'snare', label: 'Snare' },
  { value: 'clap', label: 'Clap' },
  { value: 'hatClosed', label: 'Closed hat' },
  { value: 'hatOpen', label: 'Open hat' },
  { value: 'tom', label: 'Tom' },
  { value: 'rim', label: 'Rim' },
  { value: 'crash', label: 'Crash' },
  { value: 'cowbell', label: 'Cowbell' },
  { value: 'bass808', label: '808 bass' },
];

export const DRUM_PARAMS: ParamSpec[] = [
  { kind: 'choice', key: 'kind', label: 'Voice', options: DRUM_KINDS, default: 'kick', group: 'Drum' },
  { kind: 'number', key: 'tune', label: 'Tune', min: -24, max: 24, step: 1, default: 0, unit: 'st', group: 'Drum' },
  { kind: 'number', key: 'decay', label: 'Decay', min: 0.1, max: 4, default: 1, curve: 'exp', unit: '×', group: 'Drum' },
  { kind: 'number', key: 'tone', label: 'Tone', min: 0, max: 1, default: 0.5, unit: '%', group: 'Drum' },
  { kind: 'number', key: 'punch', label: 'Punch', min: 0, max: 1, default: 0.5, unit: '%', group: 'Drum' },
  { kind: 'number', key: 'level', label: 'Level', min: 0, max: 1, default: 0.8, unit: '%', group: 'Drum' },
  { kind: 'number', key: 'choke', label: 'Choke grp', min: 0, max: 4, step: 1, default: 0, group: 'Drum' },
  { kind: 'bool', key: 'pitched', label: 'Follow pitch', default: false, group: 'Drum' },
];

export const SAMPLER_PARAMS: ParamSpec[] = [
  { kind: 'number', key: 'rootNote', label: 'Root', min: 24, max: 96, step: 1, default: 60, group: 'Sample' },
  { kind: 'number', key: 'start', label: 'Start', min: 0, max: 0.99, default: 0, unit: '%', group: 'Sample' },
  { kind: 'number', key: 'fine', label: 'Fine', min: -100, max: 100, step: 1, default: 0, unit: 'ct', group: 'Sample' },
  { kind: 'bool', key: 'reverse', label: 'Reverse', default: false, group: 'Sample' },
  { kind: 'bool', key: 'loop', label: 'Loop', default: false, group: 'Sample' },
  { kind: 'bool', key: 'oneShot', label: 'One-shot', default: true, group: 'Sample' },
  { kind: 'number', key: 'attack', label: 'Attack', min: 0.001, max: 4, default: 0.002, curve: 'exp', unit: 's', group: 'Envelope' },
  { kind: 'number', key: 'decay', label: 'Decay', min: 0.01, max: 4, default: 0.3, curve: 'exp', unit: 's', group: 'Envelope' },
  { kind: 'number', key: 'sustain', label: 'Sustain', min: 0, max: 1, default: 1, unit: '%', group: 'Envelope' },
  { kind: 'number', key: 'release', label: 'Release', min: 0.01, max: 6, default: 0.08, curve: 'exp', unit: 's', group: 'Envelope' },
  { kind: 'number', key: 'cutoff', label: 'Cutoff', min: 40, max: 20000, default: 20000, curve: 'exp', unit: 'Hz', automatable: true, group: 'Filter' },
  { kind: 'number', key: 'gain', label: 'Level', min: 0, max: 1.5, default: 0.9, unit: '%', group: 'Filter' },
];

export function instrumentSpecs(type: InstrumentType): ParamSpec[] {
  return type === 'synth' ? SYNTH_PARAMS : type === 'drum' ? DRUM_PARAMS : SAMPLER_PARAMS;
}

// -------------------------------------------------------------------- effects

const MIX = (d = 0.3): NumberParamSpec => ({ kind: 'number', key: 'mix', label: 'Mix', min: 0, max: 1, default: d, unit: '%', automatable: true });

export const EFFECT_DEFS: Record<EffectType, { name: string; params: ParamSpec[] }> = {
  eq3: {
    name: 'Parametric EQ',
    params: [
      { kind: 'number', key: 'lowGain', label: 'Low', min: -24, max: 24, default: 0, unit: 'dB', automatable: true },
      { kind: 'number', key: 'lowFreq', label: 'Low freq', min: 30, max: 1000, default: 120, curve: 'exp', unit: 'Hz', automatable: true },
      { kind: 'number', key: 'midGain', label: 'Mid', min: -24, max: 24, default: 0, unit: 'dB', automatable: true },
      { kind: 'number', key: 'midFreq', label: 'Mid freq', min: 150, max: 8000, default: 1000, curve: 'exp', unit: 'Hz', automatable: true },
      { kind: 'number', key: 'midQ', label: 'Mid Q', min: 0.2, max: 12, default: 1, curve: 'exp' },
      { kind: 'number', key: 'highGain', label: 'High', min: -24, max: 24, default: 0, unit: 'dB', automatable: true },
      { kind: 'number', key: 'highFreq', label: 'High freq', min: 1500, max: 16000, default: 6000, curve: 'exp', unit: 'Hz', automatable: true },
    ],
  },
  filter: {
    name: 'Filter',
    params: [
      { kind: 'choice', key: 'type', label: 'Type', default: 'lowpass', options: [
        { value: 'lowpass', label: 'Low-pass' },
        { value: 'highpass', label: 'High-pass' },
        { value: 'bandpass', label: 'Band-pass' },
        { value: 'notch', label: 'Notch' },
      ] },
      { kind: 'number', key: 'freq', label: 'Cutoff', min: 20, max: 20000, default: 20000, curve: 'exp', unit: 'Hz', automatable: true },
      { kind: 'number', key: 'q', label: 'Reso', min: 0.1, max: 20, default: 0.7, curve: 'exp', automatable: true },
      MIX(1),
    ],
  },
  compressor: {
    name: 'Compressor',
    params: [
      { kind: 'number', key: 'threshold', label: 'Thresh', min: -60, max: 0, default: -18, unit: 'dB', automatable: true },
      { kind: 'number', key: 'ratio', label: 'Ratio', min: 1, max: 20, default: 4, curve: 'exp', automatable: true },
      { kind: 'number', key: 'attack', label: 'Attack', min: 0.0005, max: 0.5, default: 0.01, curve: 'exp', unit: 's' },
      { kind: 'number', key: 'release', label: 'Release', min: 0.01, max: 1, default: 0.2, curve: 'exp', unit: 's' },
      { kind: 'number', key: 'knee', label: 'Knee', min: 0, max: 40, default: 6, unit: 'dB' },
      { kind: 'number', key: 'makeup', label: 'Gain', min: 0, max: 24, default: 3, unit: 'dB', automatable: true },
    ],
  },
  limiter: {
    name: 'Limiter',
    params: [
      { kind: 'number', key: 'threshold', label: 'Thresh', min: -24, max: 0, default: -3, unit: 'dB', automatable: true },
      { kind: 'number', key: 'release', label: 'Release', min: 0.01, max: 1, default: 0.1, curve: 'exp', unit: 's' },
      { kind: 'number', key: 'ceiling', label: 'Output', min: -12, max: 12, default: 2, unit: 'dB', automatable: true },
    ],
  },
  delay: {
    name: 'Delay',
    params: [
      { kind: 'choice', key: 'sync', label: 'Time', default: '1/8d', options: [
        { value: 'free', label: 'Free (ms)' },
        { value: '1/32', label: '1/32' },
        { value: '1/16', label: '1/16' },
        { value: '1/8t', label: '1/8 T' },
        { value: '1/8', label: '1/8' },
        { value: '1/8d', label: '1/8 D' },
        { value: '1/4t', label: '1/4 T' },
        { value: '1/4', label: '1/4' },
        { value: '1/4d', label: '1/4 D' },
        { value: '1/2', label: '1/2' },
        { value: '1/1', label: '1 bar' },
      ] },
      { kind: 'number', key: 'time', label: 'ms', min: 1, max: 2000, default: 300, curve: 'exp', unit: 'ms' },
      { kind: 'number', key: 'feedback', label: 'Feedback', min: 0, max: 0.95, default: 0.4, unit: '%', automatable: true },
      { kind: 'number', key: 'tone', label: 'Tone', min: 300, max: 20000, default: 6000, curve: 'exp', unit: 'Hz', automatable: true },
      { kind: 'bool', key: 'pingpong', label: 'Ping-pong', default: true },
      MIX(0.25),
    ],
  },
  reverb: {
    name: 'Reverb',
    params: [
      { kind: 'number', key: 'size', label: 'Size', min: 0.2, max: 8, default: 2.2, curve: 'exp', unit: 's' },
      { kind: 'number', key: 'damping', label: 'Damping', min: 0, max: 1, default: 0.5, unit: '%' },
      { kind: 'number', key: 'predelay', label: 'Pre-delay', min: 0, max: 0.2, default: 0.015, unit: 's' },
      { kind: 'number', key: 'lowcut', label: 'Low cut', min: 20, max: 1000, default: 150, curve: 'exp', unit: 'Hz', automatable: true },
      MIX(0.25),
    ],
  },
  distortion: {
    name: 'Distortion',
    params: [
      { kind: 'choice', key: 'mode', label: 'Mode', default: 'soft', options: [
        { value: 'soft', label: 'Soft clip' },
        { value: 'hard', label: 'Hard clip' },
        { value: 'fold', label: 'Wavefold' },
      ] },
      { kind: 'number', key: 'drive', label: 'Drive', min: 0, max: 1, default: 0.4, unit: '%' },
      { kind: 'number', key: 'tone', label: 'Tone', min: 300, max: 20000, default: 9000, curve: 'exp', unit: 'Hz', automatable: true },
      { kind: 'number', key: 'output', label: 'Output', min: -24, max: 6, default: -4, unit: 'dB', automatable: true },
      MIX(1),
    ],
  },
  chorus: {
    name: 'Chorus',
    params: [
      { kind: 'number', key: 'rate', label: 'Rate', min: 0.05, max: 8, default: 0.8, curve: 'exp', unit: 'Hz', automatable: true },
      { kind: 'number', key: 'depth', label: 'Depth', min: 0, max: 1, default: 0.5, unit: '%', automatable: true },
      { kind: 'number', key: 'delay', label: 'Delay', min: 0.005, max: 0.04, default: 0.015, unit: 's' },
      MIX(0.5),
    ],
  },
  lofi: {
    name: 'Lo-Fi Crusher',
    params: [
      { kind: 'number', key: 'bits', label: 'Bits', min: 2, max: 16, step: 1, default: 8 },
      { kind: 'number', key: 'tone', label: 'Tone', min: 500, max: 20000, default: 7000, curve: 'exp', unit: 'Hz', automatable: true },
      MIX(1),
    ],
  },
};

export const EFFECT_TYPES = Object.keys(EFFECT_DEFS) as EffectType[];

/** Spec of an automatable channel parameter, including the strip's volume and pan. */
export const CHANNEL_VOLUME_SPEC: NumberParamSpec = { kind: 'number', key: 'volume', label: 'Volume', min: 0, max: 1.25, default: 0.8, curve: 'cubic', automatable: true };
export const CHANNEL_PAN_SPEC: NumberParamSpec = { kind: 'number', key: 'pan', label: 'Pan', min: -1, max: 1, default: 0, automatable: true };
