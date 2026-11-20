// Microphone / line-in capture. Uses an AudioWorklet that timestamps blocks
// with the context clock so takes line up with the transport; falls back to
// ScriptProcessorNode where worklets are unavailable.

const WORKLET_SRC = `
class ResonixRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.buf = null;
    this.len = 0;
    this.time = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'start') { this.active = true; this.buf = null; this.len = 0; }
      else if (e.data === 'stop') { this.flush(); this.active = false; this.port.postMessage({ type: 'done' }); }
    };
  }
  flush() {
    if (!this.buf || this.len === 0) return;
    this.port.postMessage({ type: 'chunk', time: this.time, chans: this.buf.map((c) => c.slice(0, this.len)) });
    this.buf = null;
    this.len = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (!this.active || !input || input.length === 0) return true;
    if (!this.buf) {
      this.buf = input.map(() => new Float32Array(8192));
      this.len = 0;
      this.time = currentTime;
    }
    const n = input[0].length;
    for (let c = 0; c < this.buf.length; c++) this.buf[c].set(input[c] || input[0], this.len);
    this.len += n;
    if (this.len + 128 > 8192) this.flush();
    return true;
  }
}
registerProcessor('resonix-recorder', ResonixRecorder);
`;

const loadedContexts = new WeakSet<BaseAudioContext>();

interface Chunk {
  time: number;
  chans: Float32Array[];
}

export class Recorder {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | ScriptProcessorNode | null = null;
  private sink: GainNode | null = null;
  private chunks: Chunk[] = [];
  private recording = false;
  private doneResolve: (() => void) | null = null;

  constructor(private ctx: AudioContext) {}

  get ready(): boolean {
    return !!this.stream;
  }

  /** Ask for microphone access and build the capture graph. */
  async open(): Promise<void> {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Запись звука не поддерживается этим браузером');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.source = this.ctx.createMediaStreamSource(this.stream);
    // Capture nodes must be pulled by the graph; route them into a silent sink.
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;
    this.sink.connect(this.ctx.destination);

    let worklet: AudioWorkletNode | null = null;
    try {
      if (!loadedContexts.has(this.ctx)) {
        const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
        await this.ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        loadedContexts.add(this.ctx);
      }
      worklet = new AudioWorkletNode(this.ctx, 'resonix-recorder', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
      worklet.port.onmessage = (e: MessageEvent) => {
        const d = e.data as { type: string; time?: number; chans?: Float32Array[] };
        if (d.type === 'chunk' && d.chans && d.time !== undefined) this.chunks.push({ time: d.time, chans: d.chans });
        else if (d.type === 'done') this.doneResolve?.();
      };
      this.node = worklet;
    } catch {
      const sp = this.ctx.createScriptProcessor(4096, 2, 2);
      sp.onaudioprocess = (e) => {
        if (!this.recording) return;
        const chans: Float32Array[] = [];
        for (let c = 0; c < e.inputBuffer.numberOfChannels; c++) chans.push(e.inputBuffer.getChannelData(c).slice());
        this.chunks.push({ time: e.playbackTime - e.inputBuffer.duration, chans });
      };
      this.node = sp;
    }
    this.source.connect(this.node);
    this.node.connect(this.sink);
  }

  /** Input + output latency estimate in seconds. */
  latency(): number {
    const track = this.stream?.getAudioTracks()[0];
    const settings = (track?.getSettings() ?? {}) as MediaTrackSettings & { latency?: number };
    const input = typeof settings.latency === 'number' ? settings.latency : 0.01;
    return input + (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
  }

  start(): void {
    this.chunks = [];
    this.recording = true;
    if (this.node instanceof AudioWorkletNode) this.node.port.postMessage('start');
  }

  /** Stop and return audio starting exactly at context time `alignTime`. */
  async stop(alignTime: number): Promise<AudioBuffer | null> {
    if (!this.recording) return null;
    this.recording = false;
    if (this.node instanceof AudioWorkletNode) {
      await new Promise<void>((resolve) => {
        this.doneResolve = resolve;
        this.node instanceof AudioWorkletNode && this.node.port.postMessage('stop');
        setTimeout(resolve, 500);
      });
    }
    const chunks = this.chunks;
    this.chunks = [];
    if (chunks.length === 0) return null;
    const rate = this.ctx.sampleRate;
    const numCh = Math.max(1, Math.min(2, chunks[0].chans.length));
    const total = chunks.reduce((n, c) => n + c.chans[0].length, 0);
    const skip = Math.max(0, Math.round((alignTime + this.latency() - chunks[0].time) * rate));
    const length = total - skip;
    if (length <= rate * 0.05) return null;
    const out = new AudioBuffer({ length, numberOfChannels: numCh, sampleRate: rate });
    for (let ch = 0; ch < numCh; ch++) {
      const dst = out.getChannelData(ch);
      let pos = -skip;
      for (const c of chunks) {
        const src = c.chans[ch] ?? c.chans[0];
        const from = Math.max(0, -pos);
        if (from < src.length) dst.set(from === 0 ? src : src.subarray(from), Math.max(0, pos));
        pos += src.length;
      }
    }
    return out;
  }

  close(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.node?.disconnect();
    this.sink?.disconnect();
    this.stream = null;
    this.source = null;
    this.node = null;
    this.sink = null;
  }
}
