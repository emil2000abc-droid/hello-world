// Subtractive polysynth: two oscillators + sub, resonant filter with its own
// envelope, amp ADSR, LFO and mono/glide mode.

import { midiToFreq } from '../../core/music';
import { bool, num, str } from '../../core/params';
import type { ParamMap } from '../../core/types';
import {
  CUTOFF_REF,
  cleanupWhenEnded,
  fadeOut,
  hzToCents,
  releaseAdsr,
  scheduleAdsr,
  VoicePool,
  type ADSR,
  type Instrument,
  type ParamTarget,
  type Voice,
} from './common';

const MAX_FILTER_ENV_OCTAVES = 6;

export class SynthInstrument implements Instrument {
  readonly output: GainNode;
  private params: ParamMap = {};
  private pool = new VoicePool();
  /** Filter cutoff in cents relative to CUTOFF_REF; drives every voice's filter.detune. */
  private cutoffCtl: ConstantSourceNode;
  private lfo: OscillatorNode;
  private lfoGain: GainNode;
  private lastPitch: number | null = null;
  private monoVoice: Voice | null = null;

  constructor(private ctx: BaseAudioContext) {
    this.output = ctx.createGain();
    this.cutoffCtl = ctx.createConstantSource();
    this.cutoffCtl.offset.value = 0;
    this.cutoffCtl.start();
    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = 0;
    this.lfo.connect(this.lfoGain);
    this.lfo.start();
  }

  private lfoRange(): number {
    return str(this.params, 'lfoTarget', 'cutoff') === 'pitch' ? 100 : 3600;
  }

  setParams(params: ParamMap): void {
    this.params = params;
    const t = this.ctx.currentTime;
    this.cutoffCtl.offset.setTargetAtTime(hzToCents(num(params, 'cutoff', 2000)), t, 0.01);
    this.lfo.frequency.setTargetAtTime(num(params, 'lfoRate', 4), t, 0.01);
    this.lfoGain.gain.setTargetAtTime(num(params, 'lfoDepth', 0) * this.lfoRange(), t, 0.01);
  }

  automationParam(key: string): ParamTarget | null {
    switch (key) {
      case 'cutoff':
        return { param: this.cutoffCtl.offset, map: hzToCents };
      case 'lfoRate':
        return { param: this.lfo.frequency, map: (v) => v };
      case 'lfoDepth':
        return { param: this.lfoGain.gain, map: (v) => v * this.lfoRange() };
      default:
        return null;
    }
  }

  chokeGroup(): number {
    return 0;
  }

  play(pitch: number, velocity: number, when: number, duration: number, overrides?: ParamMap): Voice {
    return this.start(pitch, velocity, when, duration, overrides);
  }

  noteOn(pitch: number, velocity: number, when: number, overrides?: ParamMap): Voice {
    return this.start(pitch, velocity, when, undefined, overrides);
  }

  private start(pitch: number, velocity: number, when: number, duration: number | undefined, overrides?: ParamMap): Voice {
    const p = overrides ? { ...this.params, ...overrides } : this.params;
    const ctx = this.ctx;
    const mono = bool(p, 'mono');
    const glide = num(p, 'glide', 0);
    const fromPitch = mono && glide > 0 && this.lastPitch !== null ? this.lastPitch : pitch;
    if (mono && this.monoVoice) this.monoVoice.kill(when);
    this.lastPitch = pitch;

    const env: ADSR = {
      attack: num(p, 'attack', 0.005),
      decay: num(p, 'decay', 0.2),
      sustain: num(p, 'sustain', 0.7),
      release: num(p, 'release', 0.2),
    };

    const amp = ctx.createGain();
    amp.gain.value = 0;
    const filter = ctx.createBiquadFilter();
    filter.type = str(p, 'filterType', 'lowpass') as BiquadFilterType;
    filter.Q.value = num(p, 'resonance', 1);
    // Long-lived modulators connect into per-voice params; undo that when the voice ends.
    const unlink: (() => void)[] = [];
    const link = (src: AudioNode, dst: AudioParam) => {
      src.connect(dst);
      unlink.push(() => src.disconnect(dst));
    };
    link(this.cutoffCtl, filter.detune);
    const lfoToPitch = str(p, 'lfoTarget', 'cutoff') === 'pitch';
    if (!lfoToPitch) link(this.lfoGain, filter.detune);

    // Filter envelope rides on frequency; base cutoff comes from detune.
    const envOct = num(p, 'filterEnv', 0) * MAX_FILTER_ENV_OCTAVES;
    const fDecay = num(p, 'filterDecay', 0.3);
    filter.frequency.setValueAtTime(CUTOFF_REF * Math.pow(2, envOct), when);
    filter.frequency.setTargetAtTime(CUTOFF_REF, when + 0.001, Math.max(0.003, fDecay / 3));

    const sources: OscillatorNode[] = [];
    const mixNodes: GainNode[] = [];
    const mix = num(p, 'oscMix', 0.5);
    const addOsc = (wave: string, octave: number, detune: number, level: number) => {
      if (level <= 0.0001) return;
      const osc = ctx.createOscillator();
      osc.type = wave as OscillatorType;
      const f0 = midiToFreq(fromPitch + octave * 12);
      const f1 = midiToFreq(pitch + octave * 12);
      osc.frequency.setValueAtTime(f0, when);
      if (f0 !== f1) osc.frequency.exponentialRampToValueAtTime(f1, when + glide);
      osc.detune.value = detune;
      if (lfoToPitch) link(this.lfoGain, osc.detune);
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(filter);
      sources.push(osc);
      mixNodes.push(g);
    };
    addOsc(str(p, 'osc1Wave', 'sawtooth'), num(p, 'osc1Octave'), num(p, 'osc1Detune'), 1 - mix);
    addOsc(str(p, 'osc2Wave', 'square'), num(p, 'osc2Octave'), num(p, 'osc2Detune'), mix);
    addOsc('sine', num(p, 'osc1Octave') - 1, 0, num(p, 'subLevel', 0));
    if (sources.length === 0) addOsc('sine', 0, 0, 0.001);

    filter.connect(amp).connect(this.output);
    const peak = velocity * num(p, 'gain', 0.6) * 0.5;
    const end = scheduleAdsr(amp.gain, env, peak, when, duration);
    for (const s of sources) s.start(when);
    if (Number.isFinite(end)) for (const s of sources) s.stop(end);

    let stopped = false;
    const stopAt = (t: number) => {
      if (stopped) return;
      stopped = true;
      for (const s of sources) {
        try {
          s.stop(t);
        } catch {
          /* already stopped */
        }
      }
    };
    const voice: Voice = {
      release: (t) => {
        if (duration !== undefined) return;
        stopAt(releaseAdsr(amp.gain, env, peak, when, Math.max(t, when)));
      },
      kill: (t) => {
        fadeOut(amp.gain, Math.max(t, when));
        stopped = false;
        stopAt(Math.max(t, when) + 0.03);
      },
    };
    this.pool.add(voice);
    cleanupWhenEnded(sources, [...mixNodes, filter, amp], () => {
      for (const u of unlink) {
        try {
          u();
        } catch {
          /* already gone */
        }
      }
      this.pool.remove(voice);
      if (this.monoVoice === voice) this.monoVoice = null;
    });
    if (mono) this.monoVoice = voice;
    return voice;
  }

  allNotesOff(when: number): void {
    this.pool.killAll(when);
    this.monoVoice = null;
    this.lastPitch = null;
  }

  dispose(): void {
    this.allNotesOff(this.ctx.currentTime);
    this.cutoffCtl.stop();
    this.lfo.stop();
    this.output.disconnect();
  }
}
