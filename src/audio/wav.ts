// RIFF/WAVE encoder (PCM 16/24-bit, IEEE float 32-bit) and peak extraction.

export type WavBitDepth = 16 | 24 | 32;

export function encodeWav(channels: Float32Array[], sampleRate: number, bitDepth: WavBitDepth = 16): ArrayBuffer {
  const numCh = channels.length;
  const frames = numCh ? channels[0].length : 0;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numCh * bytesPerSample;
  const dataSize = frames * blockAlign;
  const buf = new ArrayBuffer(44 + dataSize);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, bitDepth === 32 ? 3 : 1, true);
  v.setUint16(22, numCh, true);
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * blockAlign, true);
  v.setUint16(32, blockAlign, true);
  v.setUint16(34, bitDepth, true);
  str(36, 'data');
  v.setUint32(40, dataSize, true);

  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      if (bitDepth === 16) {
        v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      } else if (bitDepth === 24) {
        const x = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff);
        v.setUint8(o, x & 0xff);
        v.setUint8(o + 1, (x >> 8) & 0xff);
        v.setUint8(o + 2, (x >> 16) & 0xff);
      } else {
        v.setFloat32(o, channels[c][i], true);
      }
      o += bytesPerSample;
    }
  }
  return buf;
}

export function audioBufferToWav(buffer: AudioBuffer, bitDepth: WavBitDepth = 16): ArrayBuffer {
  const chans: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
  return encodeWav(chans, buffer.sampleRate, bitDepth);
}

/** Absolute peak per bucket across channels, for waveform drawing. */
export function computePeaks(channels: Float32Array[], buckets: number): Float32Array {
  const out = new Float32Array(Math.max(1, buckets));
  if (channels.length === 0) return out;
  const len = channels[0].length;
  const per = len / out.length;
  for (let b = 0; b < out.length; b++) {
    const start = Math.floor(b * per);
    const end = Math.min(len, Math.max(start + 1, Math.floor((b + 1) * per)));
    let peak = 0;
    for (const ch of channels) {
      for (let i = start; i < end; i++) {
        const a = Math.abs(ch[i]);
        if (a > peak) peak = a;
      }
    }
    out[b] = peak;
  }
  return out;
}

const peakCache = new WeakMap<AudioBuffer, Float32Array>();
const PEAK_RES = 2048;

export function bufferPeaks(buffer: AudioBuffer): Float32Array {
  let p = peakCache.get(buffer);
  if (!p) {
    const chans: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
    p = computePeaks(chans, Math.min(PEAK_RES, buffer.length));
    peakCache.set(buffer, p);
  }
  return p;
}
