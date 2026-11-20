// In-memory sample bank plus a small built-in library rendered at startup
// with the studio's own instruments, so the sampler works out of the box.

import { DrumInstrument } from './instruments/drums';
import { SynthInstrument } from './instruments/synth';
import { defaultParams, DRUM_PARAMS, SYNTH_PARAMS } from '../core/params';
import { SYNTH_PRESETS } from '../project/factory';
import type { ParamMap } from '../core/types';

export interface SampleInfo {
  id: string;
  name: string;
  duration: number;
  builtin: boolean;
}

type Listener = () => void;

export class SampleBank {
  private buffers = new Map<string, AudioBuffer>();
  private info = new Map<string, SampleInfo>();
  private listeners = new Set<Listener>();

  get = (id: string): AudioBuffer | undefined => this.buffers.get(id);

  has(id: string): boolean {
    return this.buffers.has(id);
  }

  add(id: string, name: string, buffer: AudioBuffer, builtin = false): void {
    this.buffers.set(id, buffer);
    this.info.set(id, { id, name, duration: buffer.duration, builtin });
    this.emit();
  }

  remove(id: string): void {
    this.buffers.delete(id);
    this.info.delete(id);
    this.emit();
  }

  list(): SampleInfo[] {
    return [...this.info.values()];
  }

  name(id: string): string {
    return this.info.get(id)?.name ?? 'Sample';
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}

interface BuiltinDef {
  id: string;
  name: string;
  seconds: number;
  render: (ctx: OfflineAudioContext) => void;
}

function drum(kind: string, extra: ParamMap = {}, pitch = 60) {
  return (ctx: OfflineAudioContext) => {
    const d = new DrumInstrument(ctx);
    d.setParams({ ...defaultParams(DRUM_PARAMS), kind, ...extra });
    d.output.connect(ctx.destination);
    d.play(pitch, 1, 0, 0.1);
  };
}

function synth(preset: string, notes: number[], dur: number, extra: ParamMap = {}) {
  return (ctx: OfflineAudioContext) => {
    const s = new SynthInstrument(ctx);
    s.setParams({ ...defaultParams(SYNTH_PARAMS), ...SYNTH_PRESETS[preset], ...extra });
    s.output.connect(ctx.destination);
    for (const n of notes) s.play(n, 0.9, 0, dur);
  };
}

const BUILTINS: BuiltinDef[] = [
  { id: 'builtin:kick-punch', name: 'Kick — Punch', seconds: 0.8, render: drum('kick', { punch: 0.8, decay: 0.9 }) },
  { id: 'builtin:kick-long', name: 'Kick — Boom', seconds: 1.5, render: drum('kick', { punch: 0.4, decay: 2.2, tune: -3 }) },
  { id: 'builtin:snare-tight', name: 'Snare — Tight', seconds: 0.6, render: drum('snare', { tone: 0.7, decay: 0.8 }) },
  { id: 'builtin:clap-wide', name: 'Clap — Wide', seconds: 0.7, render: drum('clap', { decay: 1.4 }) },
  { id: 'builtin:hat-crisp', name: 'Hat — Crisp', seconds: 0.3, render: drum('hatClosed', { tone: 0.8 }) },
  { id: 'builtin:808-long', name: '808 — Long (C5)', seconds: 3, render: drum('bass808', { decay: 2.2, tone: 0.4, pitched: true }, 60) },
  { id: 'builtin:chord-stab', name: 'Chord stab — Cm (C5)', seconds: 1.2, render: synth('Pluck', [60, 63, 67, 72], 0.25, { cutoff: 1800 }) },
  { id: 'builtin:pad-swell', name: 'Pad swell — C (C5)', seconds: 4, render: synth('Warm Pad', [48, 60, 64, 67], 2.5) },
  { id: 'builtin:bass-pluck', name: 'Bass pluck (C5)', seconds: 1, render: synth('Deep Bass', [60], 0.3, { osc1Octave: 0, osc2Octave: 0 }) },
  {
    id: 'builtin:riser',
    name: 'Noise riser',
    seconds: 4,
    render: (ctx) => {
      const src = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 2;
      f.frequency.setValueAtTime(200, 0);
      f.frequency.exponentialRampToValueAtTime(9000, 3.9);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, 0);
      g.gain.exponentialRampToValueAtTime(0.8, 3.8);
      g.gain.linearRampToValueAtTime(0, 4);
      src.connect(f).connect(g).connect(ctx.destination);
      src.start(0);
    },
  },
];

export async function loadBuiltins(bank: SampleBank, sampleRate: number): Promise<void> {
  await Promise.all(
    BUILTINS.map(async (def) => {
      const ctx = new OfflineAudioContext(2, Math.ceil(def.seconds * sampleRate), sampleRate);
      def.render(ctx);
      const buffer = await ctx.startRendering();
      bank.add(def.id, def.name, buffer, true);
    }),
  );
}
