import type { ParamMap } from '../../core/types';

export interface Voice {
  /** Start the release phase at `when`. */
  release(when: number): void;
  /** Fade out quickly and stop (transport stop, choke). */
  kill(when: number): void;
}

/** Maps an automation value (already converted to real units) onto an AudioParam. */
export interface ParamTarget {
  param: AudioParam;
  /** Real-unit value (Hz, %, dB…) → AudioParam value. */
  map: (value: number) => number;
}

export interface Instrument {
  readonly output: AudioNode;
  setParams(params: ParamMap): void;
  /** Note with a known duration (sequenced playback). */
  play(pitch: number, velocity: number, when: number, duration: number, overrides?: ParamMap): Voice;
  /** Held note (live input); call release() on the voice to end it. */
  noteOn(pitch: number, velocity: number, when: number, overrides?: ParamMap): Voice;
  automationParam(key: string): ParamTarget | null;
  /** Choke group for drums (0 = none). */
  chokeGroup(): number;
  allNotesOff(when: number): void;
  dispose(): void;
}

export interface ADSR {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

/** Envelope level (0..1) `t` seconds after note-on, before release. Linear segments. */
export function adsrLevel(env: ADSR, t: number): number {
  if (t <= 0) return 0;
  if (t < env.attack) return t / env.attack;
  const td = t - env.attack;
  if (td < env.decay) return 1 - (1 - env.sustain) * (td / env.decay);
  return env.sustain;
}

/** Schedule attack/decay/sustain starting at `when`, optionally ending with a release after `duration`. */
export function scheduleAdsr(param: AudioParam, env: ADSR, peak: number, when: number, duration?: number): number {
  param.cancelScheduledValues(when);
  param.setValueAtTime(0, when);
  const atkEnd = when + env.attack;
  const decEnd = atkEnd + env.decay;
  const noteEnd = duration === undefined ? Infinity : when + Math.max(0.001, duration);
  if (noteEnd >= atkEnd) {
    param.linearRampToValueAtTime(peak, atkEnd);
    if (noteEnd >= decEnd) {
      param.linearRampToValueAtTime(peak * env.sustain, decEnd);
    } else {
      param.linearRampToValueAtTime(peak * adsrLevel(env, noteEnd - when), noteEnd);
    }
  } else {
    param.linearRampToValueAtTime(peak * adsrLevel(env, noteEnd - when), noteEnd);
  }
  if (duration === undefined) return Infinity;
  const level = peak * adsrLevel(env, noteEnd - when);
  param.setValueAtTime(level, noteEnd);
  param.setTargetAtTime(0, noteEnd, Math.max(0.002, env.release / 5));
  return noteEnd + env.release * 1.2 + 0.02;
}

/** Begin release of a held note. Returns the time at which the voice is silent. */
export function releaseAdsr(param: AudioParam, env: ADSR, peak: number, onTime: number, when: number): number {
  const p = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof p.cancelAndHoldAtTime === 'function') {
    p.cancelAndHoldAtTime(when);
  } else {
    param.cancelScheduledValues(when);
    param.setValueAtTime(peak * adsrLevel(env, when - onTime), when);
  }
  param.setTargetAtTime(0, when, Math.max(0.002, env.release / 5));
  return when + env.release * 1.2 + 0.02;
}

export function fadeOut(param: AudioParam, when: number, time = 0.012): void {
  const p = param as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(when);
  else param.cancelScheduledValues(when);
  param.setTargetAtTime(0, when, time / 3);
}

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/** Two seconds of white noise, shared per context. */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buf = noiseCache.get(ctx);
  if (!buf) {
    buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < d.length; i++) {
      seed = (seed * 16807) % 2147483647;
      d[i] = (seed / 2147483647) * 2 - 1;
    }
    noiseCache.set(ctx, buf);
  }
  return buf;
}

/** Stops and disconnects nodes once the last source ends. */
export function cleanupWhenEnded(sources: AudioScheduledSourceNode[], nodes: AudioNode[], onDone?: () => void): void {
  let remaining = sources.length;
  const done = () => {
    if (--remaining > 0) return;
    for (const n of [...sources, ...nodes]) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    onDone?.();
  };
  for (const s of sources) s.addEventListener('ended', done, { once: true });
}

/** Reference frequency used with BiquadFilter.detune so cutoff can be an AudioParam in cents. */
export const CUTOFF_REF = 440;

export function hzToCents(hz: number): number {
  return 1200 * Math.log2(Math.max(1, hz) / CUTOFF_REF);
}

/** Tracks live voices so they can be silenced together. */
export class VoicePool {
  private voices = new Set<Voice>();

  add(v: Voice): void {
    this.voices.add(v);
  }

  remove(v: Voice): void {
    this.voices.delete(v);
  }

  killAll(when: number): void {
    for (const v of this.voices) v.kill(when);
    this.voices.clear();
  }

  get size(): number {
    return this.voices.size;
  }
}
