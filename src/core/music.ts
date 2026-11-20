import { PPQ, TICKS_PER_STEP, type Pattern, type Project } from './types';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** FL-style naming: MIDI 60 is C5. */
export function noteName(pitch: number): string {
  return `${NOTE_NAMES[((pitch % 12) + 12) % 12]}${Math.floor(pitch / 12)}`;
}

export function isBlackKey(pitch: number): boolean {
  return [1, 3, 6, 8, 10].includes(((pitch % 12) + 12) % 12);
}

export function midiToFreq(pitch: number): number {
  return 440 * Math.pow(2, (pitch - 69) / 12);
}

export function ticksPerBeat(timeSig: [number, number]): number {
  return (PPQ * 4) / timeSig[1];
}

export function ticksPerBar(timeSig: [number, number]): number {
  return ticksPerBeat(timeSig) * timeSig[0];
}

export function stepsPerBar(timeSig: [number, number]): number {
  return ticksPerBar(timeSig) / TICKS_PER_STEP;
}

export function secondsPerTick(bpm: number): number {
  return 60 / (bpm * PPQ);
}

export function ticksToSeconds(ticks: number, bpm: number): number {
  return ticks * secondsPerTick(bpm);
}

export function secondsToTicks(seconds: number, bpm: number): number {
  return seconds / secondsPerTick(bpm);
}

export function patternLengthTicks(pattern: Pattern, timeSig: [number, number]): number {
  return pattern.bars * ticksPerBar(timeSig);
}

/** End of the arrangement, rounded up to a whole bar (at least one bar). */
export function songLengthTicks(project: Project): number {
  const bar = ticksPerBar(project.timeSig);
  let end = 0;
  for (const c of project.clips) end = Math.max(end, c.start + c.length);
  return Math.max(bar, Math.ceil(end / bar) * bar);
}

/** "bar:beat:step" (1-based), FL-style. */
export function formatPosition(tick: number, timeSig: [number, number]): string {
  const tpBar = ticksPerBar(timeSig);
  const tpBeat = ticksPerBeat(timeSig);
  const bar = Math.floor(tick / tpBar);
  const beat = Math.floor((tick - bar * tpBar) / tpBeat);
  const step = Math.floor((tick - bar * tpBar - beat * tpBeat) / TICKS_PER_STEP);
  return `${bar + 1}:${beat + 1}:${String(step + 1).padStart(2, '0')}`;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(2).padStart(5, '0')}`;
}

export function snapTick(tick: number, snap: number, mode: 'round' | 'floor' = 'round'): number {
  if (snap <= 1) return Math.round(tick);
  return (mode === 'round' ? Math.round(tick / snap) : Math.floor(tick / snap)) * snap;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function gainToDb(g: number): number {
  return g <= 0.00001 ? -Infinity : 20 * Math.log10(g);
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function formatDb(g: number): string {
  const db = gainToDb(g);
  return db === -Infinity ? '-∞ dB' : `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
}

export function formatPan(p: number): string {
  if (Math.abs(p) < 0.005) return 'C';
  return `${Math.round(Math.abs(p) * 100)}${p < 0 ? 'L' : 'R'}`;
}

let idCounter = 0;
export function uid(prefix = ''): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${idCounter.toString(36)}`;
}

export const PALETTE = [
  '#e0784f',
  '#e5b947',
  '#8fc95a',
  '#4fc4a2',
  '#4fa6e0',
  '#7e7fe8',
  '#c072dc',
  '#e06a9b',
  '#c9895c',
  '#7fb0a4',
];

export function paletteColor(i: number): string {
  return PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];
}
