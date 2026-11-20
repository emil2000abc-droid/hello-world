// Pitched sample player with ADSR, filter, reverse, loop and one-shot modes.

import { bool, num, str } from '../../core/params';
import type { ParamMap } from '../../core/types';
import {
  cleanupWhenEnded,
  CUTOFF_REF,
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

export type SampleLookup = (id: string) => AudioBuffer | undefined;

const reversedCache = new WeakMap<AudioBuffer, AudioBuffer>();

function reversed(buf: AudioBuffer): AudioBuffer {
  let r = reversedCache.get(buf);
  if (!r) {
    r = new AudioBuffer({ length: buf.length, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate });
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const src = buf.getChannelData(ch);
      const dst = r.getChannelData(ch);
      for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
    }
    reversedCache.set(buf, r);
  }
  return r;
}

export class SamplerInstrument implements Instrument {
  readonly output: GainNode;
  private params: ParamMap = {};
  private pool = new VoicePool();
  private cutoffCtl: ConstantSourceNode;

  constructor(
    private ctx: BaseAudioContext,
    private lookup: SampleLookup,
  ) {
    this.output = ctx.createGain();
    this.cutoffCtl = ctx.createConstantSource();
    this.cutoffCtl.start();
  }

  setParams(params: ParamMap): void {
    this.params = params;
    this.cutoffCtl.offset.setTargetAtTime(hzToCents(num(params, 'cutoff', 20000)), this.ctx.currentTime, 0.01);
  }

  automationParam(key: string): ParamTarget | null {
    return key === 'cutoff' ? { param: this.cutoffCtl.offset, map: hzToCents } : null;
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
    const raw = this.lookup(str(p, 'sampleId'));
    const silent: Voice = { release: () => {}, kill: () => {} };
    if (!raw) return silent;
    const buf = bool(p, 'reverse') ? reversed(raw) : raw;
    const ctx = this.ctx;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    const rate = Math.pow(2, (pitch - num(p, 'rootNote', 60)) / 12 + num(p, 'fine', 0) / 1200);
    src.playbackRate.value = rate;
    const offset = num(p, 'start', 0) * buf.duration;
    const loop = bool(p, 'loop') && !bool(p, 'oneShot', true);
    if (loop) {
      src.loop = true;
      src.loopStart = offset;
      src.loopEnd = buf.duration;
    }

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = CUTOFF_REF;
    filter.Q.value = 0.7;
    this.cutoffCtl.connect(filter.detune);

    const amp = ctx.createGain();
    amp.gain.value = 0;
    src.connect(filter).connect(amp).connect(this.output);

    const peak = velocity * num(p, 'gain', 0.9);
    const oneShot = bool(p, 'oneShot', true);
    const env: ADSR = {
      attack: num(p, 'attack', 0.002),
      decay: num(p, 'decay', 0.3),
      sustain: oneShot ? 1 : num(p, 'sustain', 1),
      release: num(p, 'release', 0.08),
    };
    const natural = (buf.duration - offset) / rate;
    const effective = oneShot ? natural : duration;
    const end = scheduleAdsr(amp.gain, env, peak, when, effective);
    src.start(when, offset);
    if (Number.isFinite(end)) src.stop(loop ? end : Math.min(end, when + natural + 0.01));

    const voice: Voice = {
      release: (t) => {
        if (effective !== undefined) return;
        try {
          src.stop(releaseAdsr(amp.gain, env, peak, when, Math.max(t, when)));
        } catch {
          /* already stopped */
        }
      },
      kill: (t) => {
        fadeOut(amp.gain, Math.max(t, when));
        try {
          src.stop(Math.max(t, when) + 0.03);
        } catch {
          /* already stopped */
        }
      },
    };
    this.pool.add(voice);
    cleanupWhenEnded([src], [filter, amp], () => {
      try {
        this.cutoffCtl.disconnect(filter.detune);
      } catch {
        /* already gone */
      }
      this.pool.remove(voice);
    });
    return voice;
  }

  allNotesOff(when: number): void {
    this.pool.killAll(when);
  }

  dispose(): void {
    this.allNotesOff(this.ctx.currentTime);
    this.cutoffCtl.stop();
    this.output.disconnect();
  }
}
