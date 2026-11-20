// Realtime audio engine: owns the AudioContext, the project graph and the
// transport. Uses a lookahead scheduler driven by a worker timer so timing
// stays tight even when the UI thread is busy.

import { patternLengthTicks, secondsPerTick, songLengthTicks, ticksPerBar, ticksPerBeat } from '../core/music';
import { Store } from '../core/store';
import { TICKS_PER_STEP, type ID, type Project, type TransportMode } from '../core/types';
import { ProjectGraph } from './graph';
import type { Voice } from './instruments';
import { Recorder } from './recorder';
import { SampleBank } from './samples';
import { primeAutomation, scheduleRange, startCoveringAudio, type SequencerHooks } from './sequencer';

const LOOKAHEAD = 0.12;
const TIMER_MS = 20;
const START_DELAY = 0.06;

export type RecordSource = 'midi' | 'audio';

export interface EngineState {
  ready: boolean;
  playing: boolean;
  recording: boolean;
  recordArmed: boolean;
  recordSource: RecordSource;
  mode: TransportMode;
  patternId: ID | null;
  loop: boolean;
  metronome: boolean;
  /** Tick where playback starts / where the playhead rests when stopped. */
  startTick: number;
  midiInputs: string[];
  error: string | null;
}

export interface RecordedNote {
  channelId: ID;
  patternId: ID;
  pitch: number;
  velocity: number;
  start: number;
  length: number;
}

interface Segment {
  tick: number;
  time: number;
  spt: number;
}

/**
 * Scheduler clock. A worker keeps ticking when the tab is in the background;
 * if workers are blocked (CSP, sandboxed frames) it falls back to setInterval.
 */
function createTimer(cb: () => void): { start(): void; stop(): void } {
  let interval: number | null = null;
  let worker: Worker | null = null;
  let running = false;
  let gotTick = false;
  const useInterval = () => {
    worker?.terminate();
    worker = null;
    if (running && interval === null) interval = window.setInterval(cb, TIMER_MS);
  };
  try {
    const src = `let id=null;onmessage=(e)=>{if(e.data==='start'){if(id===null)id=setInterval(()=>postMessage(0),${TIMER_MS});}else{clearInterval(id);id=null;}}`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'application/javascript' })));
    worker.onmessage = () => {
      gotTick = true;
      cb();
    };
    worker.onerror = useInterval;
  } catch {
    worker = null;
  }
  return {
    start: () => {
      running = true;
      if (!worker) return useInterval();
      worker.postMessage('start');
      // Watchdog: a worker that never ticks is as good as blocked.
      if (!gotTick) setTimeout(() => !gotTick && running && useInterval(), 250);
    },
    stop: () => {
      running = false;
      worker?.postMessage('stop');
      if (interval !== null) window.clearInterval(interval);
      interval = null;
    },
  };
}

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly bank = new SampleBank();
  readonly graph: ProjectGraph;
  readonly state = new Store<EngineState>({
    ready: false,
    playing: false,
    recording: false,
    recordArmed: false,
    recordSource: 'midi',
    mode: 'pattern',
    patternId: null,
    loop: true,
    metronome: false,
    startTick: 0,
    midiInputs: [],
    error: null,
  });

  /** Fired when a note played live during recording should be written. */
  onRecordedNote: ((n: RecordedNote) => void) | null = null;
  /** Fired with a finished audio take and the tick where it starts. */
  onRecordedAudio: ((buffer: AudioBuffer, tick: number) => void) | null = null;

  private project!: Project;
  private timer = createTimer(() => this.pump());
  private nextTick = 0;
  private nextTime = 0;
  private segments: Segment[] = [];
  private sources = new Set<AudioBufferSourceNode>();
  private automated = new Set<string>();
  private metronomeGain: GainNode;
  private live = new Map<string, { voice: Voice; startTick: number; velocity: number; patternId: ID | null }>();
  private liveChannel: ID | null = null;
  private recorder: Recorder | null = null;
  private recordAlignTime = 0;
  private recordStartTick = 0;
  private stopAt: number | null = null;
  private meterScratch = new Float32Array(512);
  private hooks: SequencerHooks;

  constructor() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    this.graph = new ProjectGraph(this.ctx, this.ctx.destination, this.bank.get, true);
    this.metronomeGain = this.ctx.createGain();
    this.metronomeGain.gain.value = 0.5;
    this.metronomeGain.connect(this.ctx.destination);
    this.hooks = {
      sample: this.bank.get,
      onSource: (src) => {
        this.sources.add(src);
        src.addEventListener('ended', () => this.sources.delete(src));
      },
      onAutomated: (key) => this.automated.add(key),
    };
    this.ctx.addEventListener('statechange', () => this.patch({ ready: this.ctx.state === 'running' }));
  }

  private patch(p: Partial<EngineState>): void {
    this.state.set({ ...this.state.get(), ...p });
  }

  get s(): EngineState {
    return this.state.get();
  }

  /** Must be called from a user gesture on mobile browsers. */
  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* ignored: will retry on next gesture */
      }
    }
    this.patch({ ready: this.ctx.state === 'running' });
  }

  setProject(project: Project): void {
    this.project = project;
    this.graph.sync(project);
  }

  setMode(mode: TransportMode): void {
    if (mode === this.s.mode) return;
    const wasPlaying = this.s.playing;
    if (wasPlaying) this.halt();
    this.patch({ mode, startTick: 0 });
    if (wasPlaying) void this.play();
  }

  setPattern(patternId: ID | null): void {
    this.patch({ patternId });
  }

  setLoop(loop: boolean): void {
    this.patch({ loop });
  }

  setMetronome(metronome: boolean): void {
    this.patch({ metronome });
  }

  setRecordSource(recordSource: RecordSource): void {
    this.patch({ recordSource });
  }

  setLiveChannel(id: ID | null): void {
    this.liveChannel = id;
  }

  // ---------------------------------------------------------------- transport

  private loopBounds(): { start: number; end: number; loops: boolean } {
    const p = this.project;
    if (this.s.mode === 'pattern') {
      const pat = p.patterns.find((x) => x.id === this.s.patternId) ?? p.patterns[0];
      return { start: 0, end: pat ? patternLengthTicks(pat, p.timeSig) : ticksPerBar(p.timeSig), loops: true };
    }
    if (this.s.loop && p.loop && p.loop.end > p.loop.start) return { start: p.loop.start, end: p.loop.end, loops: true };
    return { start: 0, end: songLengthTicks(p), loops: this.s.loop };
  }

  async play(): Promise<void> {
    await this.resume();
    if (this.s.playing || !this.project) return;
    const { start, end } = this.loopBounds();
    let tick = this.s.startTick;
    if (tick >= end || tick < 0) tick = start;
    const t0 = this.ctx.currentTime + START_DELAY;
    this.nextTick = tick;
    this.nextTime = t0;
    this.segments = [{ tick, time: t0, spt: secondsPerTick(this.project.bpm) }];
    this.stopAt = null;
    if (this.s.mode === 'song') {
      primeAutomation(this.graph, this.project, tick, t0, this.hooks);
      startCoveringAudio(this.graph, this.project, tick, t0, secondsPerTick(this.project.bpm), this.hooks);
    }
    const recording = this.s.recordArmed;
    if (recording && this.s.recordSource === 'audio') {
      try {
        this.recorder ??= new Recorder(this.ctx);
        await this.recorder.open();
        this.recorder.start();
        this.recordAlignTime = t0;
        this.recordStartTick = tick;
      } catch (e) {
        this.patch({ error: `Микрофон недоступен: ${(e as Error).message}`, recordArmed: false });
      }
    }
    this.patch({ playing: true, recording: recording && this.s.recordArmed, error: null });
    this.pump();
    this.timer.start();
  }

  private pump(): void {
    if (!this.s.playing) return;
    const p = this.project;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    if (this.stopAt !== null) {
      if (this.ctx.currentTime >= this.stopAt) this.stop();
      return;
    }
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 256) {
      const spt = secondsPerTick(p.bpm);
      const { start, end, loops } = this.loopBounds();
      if (this.nextTick >= end) {
        if (!loops) {
          this.stopAt = this.nextTime;
          return;
        }
        this.wrap(start, spt);
        continue;
      }
      const to = Math.min(end, Math.floor(this.nextTick / TICKS_PER_STEP) * TICKS_PER_STEP + TICKS_PER_STEP);
      scheduleRange(this.graph, { project: p, mode: this.s.mode, patternId: this.s.patternId, from: this.nextTick, to, time: this.nextTime, spt }, this.hooks);
      if (this.s.metronome) this.scheduleClicks(this.nextTick, to, this.nextTime, spt);
      const last = this.segments[this.segments.length - 1];
      if (!last || last.spt !== spt) this.segments.push({ tick: this.nextTick, time: this.nextTime, spt });
      this.nextTime += (to - this.nextTick) * spt;
      this.nextTick = to;
    }
    // Drop segments the playhead has passed.
    const now = this.ctx.currentTime;
    while (this.segments.length > 1 && this.segments[1].time <= now) this.segments.shift();
  }

  private wrap(start: number, spt: number): void {
    // Hold notes ringing past the loop end; FL also lets them ring.
    this.nextTick = start;
    this.segments.push({ tick: start, time: this.nextTime, spt });
    if (this.s.mode === 'song') {
      startCoveringAudio(this.graph, this.project, start, this.nextTime, spt, this.hooks);
      primeAutomation(this.graph, this.project, start, this.nextTime, this.hooks);
    }
  }

  private scheduleClicks(from: number, to: number, time: number, spt: number): void {
    const beat = ticksPerBeat(this.project.timeSig);
    const bar = ticksPerBar(this.project.timeSig);
    for (let t = Math.ceil(from / beat) * beat; t < to; t += beat) {
      const when = time + (t - from) * spt;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.frequency.value = t % bar === 0 ? 1760 : 1175;
      g.gain.setValueAtTime(0, when);
      g.gain.linearRampToValueAtTime(t % bar === 0 ? 0.9 : 0.55, when + 0.001);
      g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
      osc.connect(g).connect(this.metronomeGain);
      osc.start(when);
      osc.stop(when + 0.06);
      osc.onended = () => g.disconnect();
    }
  }

  /** Silence everything and stop scheduling without touching startTick. */
  private halt(): void {
    this.timer.stop();
    const now = this.ctx.currentTime;
    this.graph.allNotesOff(now);
    for (const s of this.sources) {
      try {
        s.stop(now + 0.01);
      } catch {
        /* not started */
      }
    }
    this.sources.clear();
    if (this.automated.size) {
      this.automated.clear();
      this.graph.resync();
    }
    this.patch({ playing: false });
    void this.finishRecording();
  }

  pause(): void {
    if (!this.s.playing) return;
    const tick = this.playheadTick();
    this.halt();
    this.patch({ startTick: Math.floor(tick) });
  }

  /** Stop and return to the start marker (FL behaviour). */
  stop(): void {
    if (this.s.playing) this.halt();
    else this.patch({ startTick: 0 });
  }

  togglePlay(): void {
    if (this.s.playing) this.stop();
    else void this.play();
  }

  seek(tick: number): void {
    const t = Math.max(0, Math.floor(tick));
    if (this.s.playing) {
      this.halt();
      this.patch({ startTick: t });
      void this.play();
    } else {
      this.patch({ startTick: t });
    }
  }

  playheadTick(): number {
    if (!this.s.playing) return this.s.startTick;
    const now = this.ctx.currentTime - (this.ctx.outputLatency || 0);
    let seg = this.segments[0];
    for (const s of this.segments) if (s.time <= now) seg = s;
    if (!seg) return this.s.startTick;
    return Math.max(seg.tick, seg.tick + (now - seg.time) / seg.spt);
  }

  /** Seconds elapsed on the timeline at the playhead (for the time display). */
  playheadSeconds(): number {
    return this.playheadTick() * secondsPerTick(this.project?.bpm ?? 120);
  }

  // ---------------------------------------------------------------- recording

  async armRecord(armed: boolean): Promise<void> {
    if (armed && this.s.recordSource === 'audio') {
      try {
        await this.resume();
        this.recorder ??= new Recorder(this.ctx);
        await this.recorder.open();
      } catch (e) {
        this.patch({ recordArmed: false, error: `Микрофон недоступен: ${(e as Error).message}` });
        return;
      }
    }
    this.patch({ recordArmed: armed });
  }

  private async finishRecording(): Promise<void> {
    if (!this.s.recording) return;
    this.patch({ recording: false });
    if (this.recorder && this.s.recordSource === 'audio') {
      const buf = await this.recorder.stop(this.recordAlignTime);
      if (buf) this.onRecordedAudio?.(buf, this.recordStartTick);
    }
  }

  // ---------------------------------------------------------------- live play

  noteOn(channelId: ID | null, pitch: number, velocity = 0.85): void {
    const id = channelId ?? this.liveChannel;
    if (!id) return;
    void this.resume();
    const strip = this.graph.channels.get(id);
    if (!strip) return;
    const key = `${id}:${pitch}`;
    this.live.get(key)?.voice.release(this.ctx.currentTime);
    const when = this.ctx.currentTime;
    const voice = strip.instrument.noteOn(pitch, velocity, when);
    this.graph.choke(strip.instrument.chokeGroup(), voice, when);
    const recording = this.s.playing && this.s.recordArmed && this.s.recordSource === 'midi';
    this.live.set(key, {
      voice,
      startTick: recording ? this.patternTick() : -1,
      velocity,
      patternId: recording ? this.recordPatternId() : null,
    });
  }

  noteOff(channelId: ID | null, pitch: number): void {
    const id = channelId ?? this.liveChannel;
    if (!id) return;
    const key = `${id}:${pitch}`;
    const held = this.live.get(key);
    if (!held) return;
    this.live.delete(key);
    held.voice.release(this.ctx.currentTime);
    if (held.startTick >= 0 && held.patternId) {
      const pat = this.project.patterns.find((p) => p.id === held.patternId);
      if (!pat) return;
      const len = patternLengthTicks(pat, this.project.timeSig);
      let length = this.patternTick() - held.startTick;
      if (length <= 0) length += len;
      this.onRecordedNote?.({
        channelId: id,
        patternId: held.patternId,
        pitch,
        velocity: held.velocity,
        start: Math.round(held.startTick),
        length: Math.max(6, Math.round(length)),
      });
    }
  }

  private recordPatternId(): ID | null {
    return this.s.patternId ?? this.project.patterns[0]?.id ?? null;
  }

  private patternTick(): number {
    const pat = this.project.patterns.find((p) => p.id === this.recordPatternId());
    if (!pat) return 0;
    const len = patternLengthTicks(pat, this.project.timeSig);
    return ((this.playheadTick() % len) + len) % len;
  }

  /** One-shot audition of a buffer through the master bus. */
  previewBuffer(buf: AudioBuffer): void {
    void this.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.9;
    src.connect(g).connect(this.graph.master.input);
    src.start();
    src.onended = () => g.disconnect();
  }

  // ---------------------------------------------------------------- MIDI input

  async connectMidi(): Promise<void> {
    const nav = navigator as Navigator & { requestMIDIAccess?: () => Promise<MIDIAccess> };
    if (!nav.requestMIDIAccess) {
      this.patch({ error: 'Web MIDI не поддерживается этим браузером' });
      return;
    }
    try {
      const access = await nav.requestMIDIAccess();
      const attach = () => {
        const names: string[] = [];
        access.inputs.forEach((input) => {
          names.push(input.name ?? 'MIDI input');
          input.onmidimessage = (e: MIDIMessageEvent) => {
            const d = e.data;
            if (!d || d.length < 3) return;
            const cmd = d[0] & 0xf0;
            if (cmd === 0x90 && d[2] > 0) this.noteOn(null, d[1], d[2] / 127);
            else if (cmd === 0x80 || (cmd === 0x90 && d[2] === 0)) this.noteOff(null, d[1]);
          };
        });
        this.patch({ midiInputs: names });
      };
      attach();
      access.onstatechange = attach;
    } catch (e) {
      this.patch({ error: `MIDI недоступен: ${(e as Error).message}` });
    }
  }

  clearError(): void {
    this.patch({ error: null });
  }

  // ---------------------------------------------------------------- meters

  private peak(a: AnalyserNode): number {
    const buf = this.meterScratch.length >= a.fftSize ? this.meterScratch : (this.meterScratch = new Float32Array(a.fftSize));
    const view = buf.subarray(0, a.fftSize);
    a.getFloatTimeDomainData(view);
    let p = 0;
    for (let i = 0; i < view.length; i++) {
      const v = Math.abs(view[i]);
      if (v > p) p = v;
    }
    return p;
  }

  stripLevels(index: number): [number, number] {
    const a = this.graph.strips[index]?.analysers;
    return a ? [this.peak(a[0]), this.peak(a[1])] : [0, 0];
  }

  channelLevel(id: ID): number {
    const a = this.graph.channels.get(id)?.analyser;
    return a ? this.peak(a) : 0;
  }
}
