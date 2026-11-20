// Mixer insert effects built from native Web Audio nodes.

import { dbToGain } from '../../core/music';
import { bool, num, str } from '../../core/params';
import type { EffectType, ParamMap } from '../../core/types';
import type { ParamTarget } from '../instruments/common';

export interface Effect {
  readonly input: AudioNode;
  readonly output: AudioNode;
  setParams(params: ParamMap): void;
  setTempo(bpm: number): void;
  automationParam(key: string): ParamTarget | null;
  dispose(): void;
}

const smooth = (param: AudioParam, value: number, ctx: BaseAudioContext) => param.setTargetAtTime(value, ctx.currentTime, 0.015);

/** Dry/wet scaffold: `mix` drives both legs from one automatable control. */
abstract class MixEffect implements Effect {
  readonly input: GainNode;
  readonly output: GainNode;
  protected wet: GainNode;
  private dry: GainNode;
  private mixCtl: ConstantSourceNode;
  private invert: GainNode;
  protected params: ParamMap = {};

  constructor(protected ctx: BaseAudioContext) {
    this.input = ctx.createGain();
    this.output = ctx.createGain();
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry.gain.value = 1;
    this.wet.gain.value = 0;
    this.mixCtl = ctx.createConstantSource();
    this.mixCtl.offset.value = 0;
    this.invert = ctx.createGain();
    this.invert.gain.value = -1;
    this.mixCtl.connect(this.wet.gain);
    this.mixCtl.connect(this.invert).connect(this.dry.gain);
    this.mixCtl.start();
    this.input.connect(this.dry).connect(this.output);
    this.wet.connect(this.output);
  }

  setParams(params: ParamMap): void {
    this.params = params;
    smooth(this.mixCtl.offset, num(params, 'mix', 0.5), this.ctx);
    this.apply(params);
  }

  protected abstract apply(params: ParamMap): void;

  setTempo(_bpm: number): void {}

  automationParam(key: string): ParamTarget | null {
    if (key === 'mix') return { param: this.mixCtl.offset, map: (v) => v };
    return this.paramTarget(key);
  }

  protected paramTarget(_key: string): ParamTarget | null {
    return null;
  }

  dispose(): void {
    this.mixCtl.stop();
    this.input.disconnect();
    this.output.disconnect();
  }
}

class EQ3 implements Effect {
  readonly input: BiquadFilterNode;
  readonly output: BiquadFilterNode;
  private mid: BiquadFilterNode;

  constructor(private ctx: BaseAudioContext) {
    this.input = ctx.createBiquadFilter();
    this.input.type = 'lowshelf';
    this.mid = ctx.createBiquadFilter();
    this.mid.type = 'peaking';
    this.output = ctx.createBiquadFilter();
    this.output.type = 'highshelf';
    this.input.connect(this.mid).connect(this.output);
  }

  setParams(p: ParamMap): void {
    const c = this.ctx;
    smooth(this.input.gain, num(p, 'lowGain'), c);
    smooth(this.input.frequency, num(p, 'lowFreq', 120), c);
    smooth(this.mid.gain, num(p, 'midGain'), c);
    smooth(this.mid.frequency, num(p, 'midFreq', 1000), c);
    smooth(this.mid.Q, num(p, 'midQ', 1), c);
    smooth(this.output.gain, num(p, 'highGain'), c);
    smooth(this.output.frequency, num(p, 'highFreq', 6000), c);
  }

  setTempo(): void {}

  automationParam(key: string): ParamTarget | null {
    const id = (v: number) => v;
    switch (key) {
      case 'lowGain':
        return { param: this.input.gain, map: id };
      case 'lowFreq':
        return { param: this.input.frequency, map: id };
      case 'midGain':
        return { param: this.mid.gain, map: id };
      case 'midFreq':
        return { param: this.mid.frequency, map: id };
      case 'highGain':
        return { param: this.output.gain, map: id };
      case 'highFreq':
        return { param: this.output.frequency, map: id };
      default:
        return null;
    }
  }

  dispose(): void {
    this.input.disconnect();
    this.mid.disconnect();
    this.output.disconnect();
  }
}

class Filter extends MixEffect {
  private f: BiquadFilterNode;

  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.f = ctx.createBiquadFilter();
    this.input.connect(this.f).connect(this.wet);
  }

  protected apply(p: ParamMap): void {
    this.f.type = str(p, 'type', 'lowpass') as BiquadFilterType;
    smooth(this.f.frequency, num(p, 'freq', 20000), this.ctx);
    smooth(this.f.Q, num(p, 'q', 0.7), this.ctx);
  }

  protected paramTarget(key: string): ParamTarget | null {
    if (key === 'freq') return { param: this.f.frequency, map: (v) => v };
    if (key === 'q') return { param: this.f.Q, map: (v) => v };
    return null;
  }
}

class Compressor implements Effect {
  readonly input: DynamicsCompressorNode;
  readonly output: GainNode;

  constructor(
    private ctx: BaseAudioContext,
    private limiter = false,
  ) {
    this.input = ctx.createDynamicsCompressor();
    this.output = ctx.createGain();
    this.input.connect(this.output);
  }

  setParams(p: ParamMap): void {
    const c = this.ctx;
    const comp = this.input;
    smooth(comp.threshold, num(p, 'threshold', -18), c);
    smooth(comp.release, num(p, 'release', 0.2), c);
    if (this.limiter) {
      smooth(comp.ratio, 20, c);
      smooth(comp.attack, 0.001, c);
      smooth(comp.knee, 0, c);
      smooth(this.output.gain, dbToGain(num(p, 'ceiling', 0)), c);
    } else {
      smooth(comp.ratio, num(p, 'ratio', 4), c);
      smooth(comp.attack, num(p, 'attack', 0.01), c);
      smooth(comp.knee, num(p, 'knee', 6), c);
      smooth(this.output.gain, dbToGain(num(p, 'makeup', 0)), c);
    }
  }

  setTempo(): void {}

  automationParam(key: string): ParamTarget | null {
    if (key === 'threshold') return { param: this.input.threshold, map: (v) => v };
    if (key === 'ratio') return { param: this.input.ratio, map: (v) => v };
    if (key === 'makeup' || key === 'ceiling') return { param: this.output.gain, map: dbToGain };
    return null;
  }

  dispose(): void {
    this.input.disconnect();
    this.output.disconnect();
  }
}

const SYNC_BEATS: Record<string, number> = {
  '1/32': 0.125,
  '1/16': 0.25,
  '1/8t': 1 / 3,
  '1/8': 0.5,
  '1/8d': 0.75,
  '1/4t': 2 / 3,
  '1/4': 1,
  '1/4d': 1.5,
  '1/2': 2,
  '1/1': 4,
};

export function delaySeconds(sync: string, ms: number, bpm: number): number {
  const beats = SYNC_BEATS[sync];
  return Math.min(3.9, beats === undefined ? ms / 1000 : (beats * 60) / bpm);
}

class Delay extends MixEffect {
  private bpm = 120;
  // Straight stereo path.
  private sendStraight: GainNode;
  private d: DelayNode;
  private tone: BiquadFilterNode;
  private fb: GainNode;
  // Ping-pong path.
  private sendPP: GainNode;
  private dL: DelayNode;
  private dR: DelayNode;
  private toneL: BiquadFilterNode;
  private toneR: BiquadFilterNode;
  private fbL: GainNode;
  private fbR: GainNode;
  private fbCtl: ConstantSourceNode;
  private toneCtl: ConstantSourceNode;

  constructor(ctx: BaseAudioContext) {
    super(ctx);
    const mkTone = () => {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 0;
      return f;
    };
    const mkFb = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      return g;
    };
    // Feedback and tone are driven by shared controls so automation hits both paths.
    this.fbCtl = ctx.createConstantSource();
    this.toneCtl = ctx.createConstantSource();
    this.fbCtl.start();
    this.toneCtl.start();

    this.sendStraight = ctx.createGain();
    this.d = ctx.createDelay(4);
    this.tone = mkTone();
    this.fb = mkFb();
    this.input.connect(this.sendStraight).connect(this.d);
    this.d.connect(this.tone).connect(this.fb).connect(this.d);
    this.d.connect(this.wet);

    this.sendPP = ctx.createGain();
    const mono = ctx.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = 'explicit';
    mono.channelInterpretation = 'speakers';
    this.dL = ctx.createDelay(4);
    this.dR = ctx.createDelay(4);
    this.toneL = mkTone();
    this.toneR = mkTone();
    this.fbL = mkFb();
    this.fbR = mkFb();
    const merger = ctx.createChannelMerger(2);
    this.input.connect(this.sendPP).connect(mono).connect(this.dL);
    this.dL.connect(this.toneL).connect(this.fbL).connect(this.dR);
    this.dR.connect(this.toneR).connect(this.fbR).connect(this.dL);
    this.dL.connect(merger, 0, 0);
    this.dR.connect(merger, 0, 1);
    merger.connect(this.wet);

    for (const g of [this.fb, this.fbL, this.fbR]) this.fbCtl.connect(g.gain);
    for (const f of [this.tone, this.toneL, this.toneR]) this.toneCtl.connect(f.frequency);
  }

  setTempo(bpm: number): void {
    this.bpm = bpm;
    this.applyTime();
  }

  private applyTime(): void {
    const t = delaySeconds(str(this.params, 'sync', '1/8'), num(this.params, 'time', 300), this.bpm);
    for (const d of [this.d, this.dL, this.dR]) smooth(d.delayTime, t, this.ctx);
  }

  protected apply(p: ParamMap): void {
    const pp = bool(p, 'pingpong', true);
    smooth(this.sendStraight.gain, pp ? 0 : 1, this.ctx);
    smooth(this.sendPP.gain, pp ? 1 : 0, this.ctx);
    smooth(this.fbCtl.offset, num(p, 'feedback', 0.4), this.ctx);
    smooth(this.toneCtl.offset, num(p, 'tone', 6000), this.ctx);
    this.applyTime();
  }

  protected paramTarget(key: string): ParamTarget | null {
    if (key === 'feedback') return { param: this.fbCtl.offset, map: (v) => v };
    if (key === 'tone') return { param: this.toneCtl.offset, map: (v) => v };
    return null;
  }

  dispose(): void {
    // Break the feedback loops so the graph can be collected.
    for (const n of [this.d, this.dL, this.dR, this.tone, this.toneL, this.toneR, this.fb, this.fbL, this.fbR]) n.disconnect();
    this.fbCtl.stop();
    this.toneCtl.stop();
    super.dispose();
  }
}

/** Exponentially decaying stereo noise, progressively low-passed for damping. */
export function makeImpulse(ctx: BaseAudioContext, seconds: number, damping: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    let seed = ch === 0 ? 12345 : 67890;
    for (let i = 0; i < len; i++) {
      seed = (seed * 16807) % 2147483647;
      const white = (seed / 2147483647) * 2 - 1;
      const t = i / len;
      // Coefficient closes over time: later reflections are darker.
      const a = 1 - Math.min(0.97, damping * 0.9 * t + 0.05);
      lp += a * (white - lp);
      d[i] = lp * Math.exp(-6.9 * t) * (1 - Math.pow(t, 8));
    }
  }
  return buf;
}

class Reverb extends MixEffect {
  private pre: DelayNode;
  private conv: ConvolverNode;
  private hp: BiquadFilterNode;
  private irKey = '';

  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.pre = ctx.createDelay(1);
    this.conv = ctx.createConvolver();
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.input.connect(this.pre).connect(this.conv).connect(this.hp).connect(this.wet);
  }

  protected apply(p: ParamMap): void {
    smooth(this.pre.delayTime, num(p, 'predelay', 0.015), this.ctx);
    smooth(this.hp.frequency, num(p, 'lowcut', 150), this.ctx);
    const size = num(p, 'size', 2);
    const damping = num(p, 'damping', 0.5);
    const key = `${size.toFixed(2)}:${damping.toFixed(2)}`;
    if (key !== this.irKey) {
      this.irKey = key;
      this.conv.buffer = makeImpulse(this.ctx, size, damping);
    }
  }

  protected paramTarget(key: string): ParamTarget | null {
    return key === 'lowcut' ? { param: this.hp.frequency, map: (v) => v } : null;
  }
}

export function distortionCurve(mode: string, drive: number, n = 2048): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(n);
  const k = 1 + drive * 40;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    let y: number;
    if (mode === 'hard') y = Math.max(-1, Math.min(1, x * k * 0.5));
    else if (mode === 'fold') y = Math.sin(x * (1 + drive * 6) * (Math.PI / 2));
    else y = Math.tanh(x * k) / Math.tanh(k);
    curve[i] = y;
  }
  return curve;
}

class Distortion extends MixEffect {
  private shaper: WaveShaperNode;
  private tone: BiquadFilterNode;
  private out: GainNode;
  private curveKey = '';

  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.shaper = ctx.createWaveShaper();
    this.shaper.oversample = '4x';
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.out = ctx.createGain();
    this.input.connect(this.shaper).connect(this.tone).connect(this.out).connect(this.wet);
  }

  protected apply(p: ParamMap): void {
    const key = `${str(p, 'mode', 'soft')}:${num(p, 'drive', 0.4).toFixed(3)}`;
    if (key !== this.curveKey) {
      this.curveKey = key;
      this.shaper.curve = distortionCurve(str(p, 'mode', 'soft'), num(p, 'drive', 0.4));
    }
    smooth(this.tone.frequency, num(p, 'tone', 9000), this.ctx);
    smooth(this.out.gain, dbToGain(num(p, 'output', -4)), this.ctx);
  }

  protected paramTarget(key: string): ParamTarget | null {
    if (key === 'tone') return { param: this.tone.frequency, map: (v) => v };
    if (key === 'output') return { param: this.out.gain, map: dbToGain };
    return null;
  }
}

class Chorus extends MixEffect {
  private dL: DelayNode;
  private dR: DelayNode;
  private lfo: OscillatorNode;
  private depthL: GainNode;
  private depthR: GainNode;
  private depthCtl: ConstantSourceNode;

  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.dL = ctx.createDelay(0.1);
    this.dR = ctx.createDelay(0.1);
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.depthL = ctx.createGain();
    this.depthR = ctx.createGain();
    this.depthL.gain.value = 0;
    this.depthR.gain.value = 0;
    this.depthCtl = ctx.createConstantSource();
    this.depthCtl.offset.value = 0;
    const neg = ctx.createGain();
    neg.gain.value = -1;
    this.depthCtl.connect(this.depthL.gain);
    this.depthCtl.connect(neg).connect(this.depthR.gain);
    this.lfo.connect(this.depthL).connect(this.dL.delayTime);
    this.lfo.connect(this.depthR).connect(this.dR.delayTime);
    const merger = ctx.createChannelMerger(2);
    this.input.connect(this.dL).connect(merger, 0, 0);
    this.input.connect(this.dR).connect(merger, 0, 1);
    merger.connect(this.wet);
    this.lfo.start();
    this.depthCtl.start();
  }

  protected apply(p: ParamMap): void {
    smooth(this.lfo.frequency, num(p, 'rate', 0.8), this.ctx);
    const delay = num(p, 'delay', 0.015);
    smooth(this.dL.delayTime, delay, this.ctx);
    smooth(this.dR.delayTime, delay, this.ctx);
    smooth(this.depthCtl.offset, this.depthSeconds(num(p, 'depth', 0.5)), this.ctx);
  }

  private depthSeconds(depth: number): number {
    return depth * num(this.params, 'delay', 0.015) * 0.6;
  }

  protected paramTarget(key: string): ParamTarget | null {
    if (key === 'rate') return { param: this.lfo.frequency, map: (v) => v };
    if (key === 'depth') return { param: this.depthCtl.offset, map: (v) => this.depthSeconds(v) };
    return null;
  }

  dispose(): void {
    this.lfo.stop();
    this.depthCtl.stop();
    super.dispose();
  }
}

export function crushCurve(bits: number): Float32Array<ArrayBuffer> {
  const n = 4096;
  const levels = Math.pow(2, Math.max(1, bits - 1));
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.round(x * levels) / levels;
  }
  return curve;
}

class LoFi extends MixEffect {
  private shaper: WaveShaperNode;
  private tone: BiquadFilterNode;
  private bits = -1;

  constructor(ctx: BaseAudioContext) {
    super(ctx);
    this.shaper = ctx.createWaveShaper();
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.input.connect(this.shaper).connect(this.tone).connect(this.wet);
  }

  protected apply(p: ParamMap): void {
    const bits = Math.round(num(p, 'bits', 8));
    if (bits !== this.bits) {
      this.bits = bits;
      this.shaper.curve = crushCurve(bits);
    }
    smooth(this.tone.frequency, num(p, 'tone', 7000), this.ctx);
  }

  protected paramTarget(key: string): ParamTarget | null {
    return key === 'tone' ? { param: this.tone.frequency, map: (v) => v } : null;
  }
}

export function createEffect(ctx: BaseAudioContext, type: EffectType): Effect {
  switch (type) {
    case 'eq3':
      return new EQ3(ctx);
    case 'filter':
      return new Filter(ctx);
    case 'compressor':
      return new Compressor(ctx);
    case 'limiter':
      return new Compressor(ctx, true);
    case 'delay':
      return new Delay(ctx);
    case 'reverb':
      return new Reverb(ctx);
    case 'distortion':
      return new Distortion(ctx);
    case 'chorus':
      return new Chorus(ctx);
    case 'lofi':
      return new LoFi(ctx);
  }
}
