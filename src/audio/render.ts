// Offline bounce: build the same graph on an OfflineAudioContext and schedule
// the whole song (or one pattern) up front.

import { patternLengthTicks, secondsPerTick, songLengthTicks } from '../core/music';
import { TICKS_PER_STEP, type ID, type Project, type TransportMode } from '../core/types';
import { ProjectGraph } from './graph';
import { primeAutomation, scheduleRange, type SequencerHooks } from './sequencer';

export interface RenderOptions {
  mode: TransportMode;
  patternId: ID | null;
  sampleRate?: number;
  /** Seconds of tail after the last bar (reverb/delay decay). */
  tail?: number;
  /** Render only this mixer insert (stem); null = full mix. */
  soloInsert?: number | null;
  /** Range in ticks; defaults to the song or pattern length. */
  from?: number;
  to?: number;
}

export function renderLength(project: Project, opts: RenderOptions): { from: number; to: number } {
  if (opts.from !== undefined && opts.to !== undefined) return { from: opts.from, to: opts.to };
  if (opts.mode === 'pattern') {
    const pat = project.patterns.find((p) => p.id === opts.patternId) ?? project.patterns[0];
    return { from: 0, to: pat ? patternLengthTicks(pat, project.timeSig) : 0 };
  }
  return { from: 0, to: songLengthTicks(project) };
}

export async function renderProject(
  project: Project,
  sample: (id: string) => AudioBuffer | undefined,
  opts: RenderOptions,
): Promise<AudioBuffer> {
  const rate = opts.sampleRate ?? 44100;
  const tail = opts.tail ?? 2.5;
  const { from, to } = renderLength(project, opts);
  const spt = secondsPerTick(project.bpm);
  const seconds = (to - from) * spt + tail;

  let proj = project;
  if (opts.soloInsert !== undefined && opts.soloInsert !== null) {
    const keep = opts.soloInsert;
    proj = {
      ...project,
      mixer: project.mixer.map((t, i) => (i === 0 || i === keep ? { ...t, mute: false, solo: false } : { ...t, mute: true, solo: false })),
    };
  }

  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(seconds * rate)), rate);
  const graph = new ProjectGraph(ctx, ctx.destination, sample, false);
  graph.sync(proj, true);
  const hooks: SequencerHooks = { sample };
  const start = 0.02;
  if (opts.mode === 'song') primeAutomation(graph, proj, from, start, hooks);
  for (let t = from; t < to; t += TICKS_PER_STEP) {
    const end = Math.min(to, t + TICKS_PER_STEP);
    scheduleRange(graph, { project: proj, mode: opts.mode, patternId: opts.patternId, from: t, to: end, time: start + (t - from) * spt, spt }, hooks);
  }
  return ctx.startRendering();
}

/** Peak-normalise in place to `ceiling` (linear); returns the gain applied. */
export function normalize(buffer: AudioBuffer, ceiling = 0.98): number {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  if (peak <= 0) return 1;
  const g = ceiling / peak;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= g;
  }
  return g;
}
