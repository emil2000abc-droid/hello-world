// Synthesised drum voices. Each hit builds a tiny node graph that tears
// itself down when it ends.

import { midiToFreq } from '../../core/music';
import { bool, num, str } from '../../core/params';
import type { ParamMap } from '../../core/types';
import { cleanupWhenEnded, fadeOut, noiseBuffer, VoicePool, type Instrument, type ParamTarget, type Voice } from './common';

interface Hit {
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  /** Final gain stage, used for choke / kill. */
  vca: GainNode;
  end: number;
}

interface DrumCtx {
  ctx: BaseAudioContext;
  out: AudioNode;
  when: number;
  vel: number;
  /** Frequency multiplier from tune and pitch tracking. */
  tf: number;
  pitch: number;
  pitched: boolean;
  decay: number;
  tone: number;
  punch: number;
}

const METAL_RATIOS = [2, 3, 4.16, 5.43, 6.79, 8.21];

function noise(c: DrumCtx): AudioBufferSourceNode {
  const src = c.ctx.createBufferSource();
  src.buffer = noiseBuffer(c.ctx);
  src.loop = true;
  src.loopEnd = src.buffer.duration;
  // Random offset so consecutive hits don't sound identical.
  src.start(c.when, Math.random() * 1.5);
  return src;
}

function vcaNode(c: DrumCtx): GainNode {
  const g = c.ctx.createGain();
  g.gain.value = 0;
  g.connect(c.out);
  return g;
}

function expDecay(param: AudioParam, when: number, peak: number, time: number, attack = 0.001): number {
  param.setValueAtTime(0, when);
  param.linearRampToValueAtTime(peak, when + attack);
  param.setTargetAtTime(0, when + attack, time / 4.5);
  return when + attack + time * 1.1;
}

function kick(c: DrumCtx): Hit {
  const { ctx, when } = c;
  const vca = vcaNode(c);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const base = 48 * c.tf;
  osc.frequency.setValueAtTime(base * (3 + c.punch * 3), when);
  osc.frequency.exponentialRampToValueAtTime(base, when + 0.03 + 0.07 * (1 - c.punch * 0.5));
  const body = ctx.createGain();
  osc.connect(body).connect(vca);
  const end = expDecay(vca.gain, when, c.vel, 0.5 * c.decay);
  osc.start(when);
  osc.stop(end);

  const click = noise(c);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500 + c.tone * 6000;
  const cg = ctx.createGain();
  expDecay(cg.gain, when, c.punch * 0.6, 0.012);
  click.connect(bp).connect(cg).connect(vca);
  click.stop(when + 0.05);
  return { sources: [osc, click], nodes: [body, bp, cg, vca], vca, end };
}

function snare(c: DrumCtx): Hit {
  const { ctx, when } = c;
  const vca = vcaNode(c);
  vca.gain.setValueAtTime(c.vel, when);
  const n = noise(c);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 900 + c.tone * 2500;
  const ng = ctx.createGain();
  const end = expDecay(ng.gain, when, 0.8, 0.22 * c.decay);
  n.connect(hp).connect(ng).connect(vca);
  n.stop(end);

  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(240 * c.tf, when);
  osc.frequency.exponentialRampToValueAtTime(170 * c.tf, when + 0.06);
  const og = ctx.createGain();
  expDecay(og.gain, when, 0.5 + c.punch * 0.5, 0.12 * c.decay);
  osc.connect(og).connect(vca);
  osc.start(when);
  osc.stop(end);
  return { sources: [n, osc], nodes: [hp, ng, og, vca], vca, end };
}

function clap(c: DrumCtx): Hit {
  const { ctx, when } = c;
  const vca = vcaNode(c);
  vca.gain.setValueAtTime(c.vel, when);
  const n = noise(c);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1100 * c.tf + c.tone * 900;
  bp.Q.value = 1.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  for (let i = 0; i < 3; i++) {
    const t = when + i * 0.011;
    g.gain.setValueAtTime(0.9, t);
    g.gain.setTargetAtTime(0.1, t + 0.001, 0.003);
  }
  const tailStart = when + 0.034;
  g.gain.setValueAtTime(0.85, tailStart);
  g.gain.setTargetAtTime(0, tailStart, (0.2 * c.decay) / 4.5);
  const end = tailStart + 0.25 * c.decay;
  n.connect(bp).connect(g).connect(vca);
  n.stop(end);
  return { sources: [n], nodes: [bp, g, vca], vca, end };
}

function metallic(c: DrumCtx, decay: number, hpFreq: number, level: number): Hit {
  const { ctx, when } = c;
  const vca = vcaNode(c);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 9000 + c.tone * 3000;
  bp.Q.value = 0.8;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = hpFreq;
  const mixG = ctx.createGain();
  mixG.gain.value = 0.18;
  const sources: AudioScheduledSourceNode[] = [];
  for (const r of METAL_RATIOS) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 40 * r * c.tf;
    o.connect(mixG);
    o.start(when);
    sources.push(o);
  }
  const n = noise(c);
  const ng = ctx.createGain();
  ng.gain.value = 0.25 + c.tone * 0.5;
  n.connect(ng).connect(bp);
  mixG.connect(bp);
  bp.connect(hp).connect(vca);
  sources.push(n);
  const end = expDecay(vca.gain, when, c.vel * level, decay * c.decay);
  for (const s of sources) s.stop(end);
  return { sources, nodes: [bp, hp, mixG, ng, vca], vca, end };
}

function tom(c: DrumCtx): Hit {
  const { ctx, when } = c;
  const vca = vcaNode(c);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const f = 130 * c.tf;
  osc.frequency.setValueAtTime(f * (1.6 + c.punch), when);
  osc.frequency.exponentialRampToValueAtTime(f, when + 0.08);
  osc.connect(vca);
  const end = expDecay(vca.gain, when, c.vel * 0.9, 0.4 * c.decay);
  osc.start(when);
  osc.stop(end);
  return { sources: [osc], nodes: [vca], vca, end };
}

function rim(c: DrumCtx): Hit {
  const { ctx, when } = c;
  const vca = vcaNode(c);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2000 * c.tf;
  bp.Q.value = 3;
  const a = ctx.createOscillator();
  a.type = 'triangle';
  a.frequency.value = 1700 * c.tf;
  const b = ctx.createOscillator();
  b.type = 'square';
  b.frequency.value = 460 * c.tf;
  a.connect(bp);
  b.connect(bp);
  bp.connect(vca);
  const end = expDecay(vca.gain, when, c.vel * 0.9, 0.05 * c.decay);
  for (const o of [a, b]) {
    o.start(when);
    o.stop(end);
  }
  return { sources: [a, b], nodes: [bp, vca], vca, end };
}

function cowbell(c: DrumCtx): Hit {
  const { ctx, when } = c;
  const vca = vcaNode(c);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2640 * c.tf;
  bp.Q.value = 1;
  const oscs = [587, 845].map((f) => {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = f * c.tf;
    o.connect(bp);
    return o;
  });
  bp.connect(vca);
  const end = expDecay(vca.gain, when, c.vel * 0.5, 0.3 * c.decay);
  for (const o of oscs) {
    o.start(when);
    o.stop(end);
  }
  return { sources: oscs, nodes: [bp, vca], vca, end };
}

const satCurves = new Map<number, Float32Array<ArrayBuffer>>();
function saturationCurve(amount: number): Float32Array<ArrayBuffer> {
  const key = Math.round(amount * 20);
  let curve = satCurves.get(key);
  if (!curve) {
    const k = 1 + key * 0.5;
    curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    satCurves.set(key, curve);
  }
  return curve;
}

function bass808(c: DrumCtx): Hit {
  const { ctx, when } = c;
  const vca = vcaNode(c);
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const f = c.pitched ? midiToFreq(c.pitch) * (c.tf / Math.pow(2, (c.pitch - 60) / 12)) : 55 * c.tf;
  osc.frequency.setValueAtTime(f * (1 + c.punch * 1.5), when);
  osc.frequency.exponentialRampToValueAtTime(f, when + 0.04);
  const shaper = ctx.createWaveShaper();
  shaper.curve = saturationCurve(c.tone);
  osc.connect(shaper).connect(vca);
  const end = expDecay(vca.gain, when, c.vel * 0.85, 1.4 * c.decay, 0.003);
  osc.start(when);
  osc.stop(end);
  return { sources: [osc], nodes: [shaper, vca], vca, end };
}

const VOICES: Record<string, (c: DrumCtx) => Hit> = {
  kick,
  snare,
  clap,
  hatClosed: (c) => metallic(c, 0.06, 7000, 0.9),
  hatOpen: (c) => metallic(c, 0.42, 6500, 0.8),
  crash: (c) => metallic(c, 1.6, 4500, 0.7),
  tom,
  rim,
  cowbell,
  bass808,
};

export class DrumInstrument implements Instrument {
  readonly output: GainNode;
  private params: ParamMap = {};
  private pool = new VoicePool();

  constructor(private ctx: BaseAudioContext) {
    this.output = ctx.createGain();
  }

  setParams(params: ParamMap): void {
    this.params = params;
  }

  automationParam(): ParamTarget | null {
    return null;
  }

  chokeGroup(): number {
    return num(this.params, 'choke', 0);
  }

  play(pitch: number, velocity: number, when: number, _duration: number, overrides?: ParamMap): Voice {
    return this.trigger(pitch, velocity, when, overrides);
  }

  noteOn(pitch: number, velocity: number, when: number, overrides?: ParamMap): Voice {
    return this.trigger(pitch, velocity, when, overrides);
  }

  private trigger(pitch: number, velocity: number, when: number, overrides?: ParamMap): Voice {
    const p = overrides ? { ...this.params, ...overrides } : this.params;
    const pitched = bool(p, 'pitched');
    const semis = num(p, 'tune', 0) + (pitched ? pitch - 60 : 0);
    const hit = (VOICES[str(p, 'kind', 'kick')] ?? kick)({
      ctx: this.ctx,
      out: this.output,
      when,
      vel: velocity * num(p, 'level', 0.8),
      tf: Math.pow(2, semis / 12),
      pitch,
      pitched,
      decay: num(p, 'decay', 1),
      tone: num(p, 'tone', 0.5),
      punch: num(p, 'punch', 0.5),
    });
    const voice: Voice = {
      release: () => {
        /* one-shot */
      },
      kill: (t) => {
        fadeOut(hit.vca.gain, Math.max(t, when), 0.008);
        for (const s of hit.sources) {
          try {
            s.stop(Math.max(t, when) + 0.02);
          } catch {
            /* already stopped */
          }
        }
      },
    };
    this.pool.add(voice);
    cleanupWhenEnded(hit.sources, hit.nodes, () => this.pool.remove(voice));
    return voice;
  }

  allNotesOff(when: number): void {
    this.pool.killAll(when);
  }

  dispose(): void {
    this.allNotesOff(this.ctx.currentTime);
    this.output.disconnect();
  }
}
