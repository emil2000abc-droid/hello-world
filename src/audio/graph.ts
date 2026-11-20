// The audio graph for one project on one AudioContext: channel strips feeding
// mixer inserts with effect chains, summed into the master. Reconciles itself
// against project data on every change (immer keeps unchanged objects stable,
// so the diff is cheap).

import type { AutomationTarget, Channel, ID, MixerTrack, Project } from '../core/types';
import { createEffect, type Effect } from './effects';
import { createInstrument, type Instrument, type ParamTarget, type SampleLookup, type Voice } from './instruments';

const RAMP = 0.015;

function setSmooth(param: AudioParam, value: number, ctx: BaseAudioContext): void {
  param.setTargetAtTime(value, ctx.currentTime, RAMP);
}

export class MixerStrip {
  readonly input: GainNode;
  readonly fader: GainNode;
  readonly panner: StereoPannerNode;
  readonly muteGain: GainNode;
  readonly analysers: [AnalyserNode, AnalyserNode] | null;
  private effects = new Map<ID, { fx: Effect; slotRef: unknown }>();
  private chainKey = '';
  private track: MixerTrack | null = null;
  private bpm = 120;

  constructor(
    private ctx: BaseAudioContext,
    destination: AudioNode,
    meters: boolean,
  ) {
    this.input = ctx.createGain();
    this.fader = ctx.createGain();
    this.panner = ctx.createStereoPanner();
    this.muteGain = ctx.createGain();
    this.fader.connect(this.panner).connect(this.muteGain).connect(destination);
    this.input.connect(this.fader);
    if (meters) {
      const split = ctx.createChannelSplitter(2);
      const l = ctx.createAnalyser();
      const r = ctx.createAnalyser();
      l.fftSize = r.fftSize = 512;
      this.muteGain.connect(split);
      split.connect(l, 0);
      split.connect(r, 1);
      this.analysers = [l, r];
    } else {
      this.analysers = null;
    }
  }

  sync(track: MixerTrack, audible: boolean, bpm: number, force = false): void {
    const tempoChanged = bpm !== this.bpm;
    this.bpm = bpm;
    if (force || !this.track || track.volume !== this.track.volume) setSmooth(this.fader.gain, track.volume, this.ctx);
    if (force || !this.track || track.pan !== this.track.pan) setSmooth(this.panner.pan, track.pan, this.ctx);
    setSmooth(this.muteGain.gain, audible ? 1 : 0, this.ctx);

    if (force || !this.track || track.effects !== this.track.effects || tempoChanged) {
      const alive = new Set<ID>();
      for (const slot of track.effects) {
        alive.add(slot.id);
        let entry = this.effects.get(slot.id);
        if (!entry) {
          entry = { fx: createEffect(this.ctx, slot.type), slotRef: null };
          this.effects.set(slot.id, entry);
        }
        if (force || entry.slotRef !== slot.params) {
          entry.fx.setParams(slot.params);
          entry.slotRef = slot.params;
        }
        if (tempoChanged || force) entry.fx.setTempo(bpm);
      }
      for (const [id, entry] of this.effects) {
        if (!alive.has(id)) {
          entry.fx.dispose();
          this.effects.delete(id);
        }
      }
      const key = track.effects.map((s) => `${s.id}${s.bypass ? '-' : '+'}`).join(',');
      if (key !== this.chainKey) {
        this.chainKey = key;
        this.rewire(track);
      }
    }
    this.track = track;
  }

  private rewire(track: MixerTrack): void {
    this.input.disconnect();
    for (const { fx } of this.effects.values()) fx.output.disconnect();
    let node: AudioNode = this.input;
    for (const slot of track.effects) {
      if (slot.bypass) continue;
      const fx = this.effects.get(slot.id)?.fx;
      if (!fx) continue;
      node.connect(fx.input);
      node = fx.output;
    }
    node.connect(this.fader);
  }

  effect(id: ID): Effect | undefined {
    return this.effects.get(id)?.fx;
  }

  dispose(): void {
    for (const { fx } of this.effects.values()) fx.dispose();
    this.effects.clear();
    this.input.disconnect();
    this.fader.disconnect();
    this.panner.disconnect();
    this.muteGain.disconnect();
  }
}

export class ChannelStrip {
  readonly instrument: Instrument;
  readonly volume: GainNode;
  readonly panner: StereoPannerNode;
  readonly mute: GainNode;
  readonly analyser: AnalyserNode | null;
  private channel: Channel | null = null;
  private routedTo = -1;

  constructor(
    private ctx: BaseAudioContext,
    readonly type: Channel['type'],
    lookup: SampleLookup,
    meters: boolean,
  ) {
    this.instrument = createInstrument(ctx, type, lookup);
    this.volume = ctx.createGain();
    this.panner = ctx.createStereoPanner();
    this.mute = ctx.createGain();
    this.instrument.output.connect(this.volume).connect(this.panner).connect(this.mute);
    if (meters) {
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.mute.connect(this.analyser);
    } else {
      this.analyser = null;
    }
  }

  sync(ch: Channel, strips: MixerStrip[], force = false): void {
    const prev = this.channel;
    if (force || !prev || prev.params !== ch.params) this.instrument.setParams(ch.params);
    if (force || !prev || prev.volume !== ch.volume) setSmooth(this.volume.gain, ch.volume, this.ctx);
    if (force || !prev || prev.pan !== ch.pan) setSmooth(this.panner.pan, ch.pan, this.ctx);
    if (force || !prev || prev.mute !== ch.mute) setSmooth(this.mute.gain, ch.mute ? 0 : 1, this.ctx);
    const target = Math.min(Math.max(0, ch.mixerTrack), strips.length - 1);
    if (target !== this.routedTo) {
      if (this.routedTo >= 0) this.mute.disconnect(strips[this.routedTo].input);
      this.mute.connect(strips[target].input);
      this.routedTo = target;
    }
    this.channel = ch;
  }

  get muted(): boolean {
    return !!this.channel?.mute;
  }

  dispose(): void {
    this.instrument.dispose();
    this.volume.disconnect();
    this.panner.disconnect();
    this.mute.disconnect();
  }
}

export class ProjectGraph {
  readonly strips: MixerStrip[] = [];
  readonly channels = new Map<ID, ChannelStrip>();
  private project: Project | null = null;
  private chokes = new Map<number, Set<Voice>>();

  constructor(
    readonly ctx: BaseAudioContext,
    private destination: AudioNode,
    private lookup: SampleLookup,
    private meters: boolean,
  ) {}

  get master(): MixerStrip {
    return this.strips[0];
  }

  sync(project: Project, force = false): void {
    const prev = this.project;
    this.project = project;
    if (!force && prev && prev.mixer === project.mixer && prev.channels === project.channels && prev.bpm === project.bpm) return;

    // Mixer: master first so inserts can route into it.
    while (this.strips.length < project.mixer.length) {
      const dest = this.strips.length === 0 ? this.destination : this.strips[0].input;
      this.strips.push(new MixerStrip(this.ctx, dest, this.meters));
    }
    const anySolo = project.mixer.some((t, i) => i > 0 && t.solo);
    project.mixer.forEach((track, i) => {
      const audible = !track.mute && (i === 0 || !anySolo || track.solo);
      this.strips[i].sync(track, audible, project.bpm, force);
    });

    const alive = new Set<ID>();
    for (const ch of project.channels) {
      alive.add(ch.id);
      let strip = this.channels.get(ch.id);
      if (strip && strip.type !== ch.type) {
        strip.dispose();
        strip = undefined;
      }
      if (!strip) {
        strip = new ChannelStrip(this.ctx, ch.type, this.lookup, this.meters);
        this.channels.set(ch.id, strip);
      }
      strip.sync(ch, this.strips, force);
    }
    for (const [id, strip] of this.channels) {
      if (!alive.has(id)) {
        strip.dispose();
        this.channels.delete(id);
      }
    }
  }

  /** Re-apply every stored value (after automation playback stops). */
  resync(): void {
    if (this.project) this.sync(this.project, true);
  }

  /** The AudioParam an automation target drives, or null if it has none. */
  resolveTarget(t: AutomationTarget): ParamTarget | null {
    const id = (v: number) => v;
    if (t.scope === 'channel') {
      const strip = this.channels.get(t.channelId);
      if (!strip) return null;
      if (t.param === 'volume') return { param: strip.volume.gain, map: id };
      if (t.param === 'pan') return { param: strip.panner.pan, map: id };
      return strip.instrument.automationParam(t.param);
    }
    const strip = this.strips[t.trackIndex];
    if (!strip) return null;
    if (t.scope === 'mixer') return t.param === 'volume' ? { param: strip.fader.gain, map: id } : { param: strip.panner.pan, map: id };
    return strip.effect(t.effectId)?.automationParam(t.param) ?? null;
  }

  /** Register a voice in its choke group, silencing the group's previous voices. */
  choke(group: number, voice: Voice, when: number): void {
    if (group <= 0) return;
    let set = this.chokes.get(group);
    if (!set) {
      set = new Set();
      this.chokes.set(group, set);
    }
    for (const v of set) v.kill(when);
    set.clear();
    set.add(voice);
  }

  allNotesOff(when: number): void {
    for (const strip of this.channels.values()) strip.instrument.allNotesOff(when);
    this.chokes.clear();
  }

  dispose(): void {
    for (const s of this.channels.values()) s.dispose();
    for (const s of this.strips) s.dispose();
    this.channels.clear();
    this.strips.length = 0;
  }
}
