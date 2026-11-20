// Standard MIDI File writer and reader (format 0/1).

import { PPQ, type Note } from '../core/types';

export interface MidiTrackData {
  name: string;
  notes: { pitch: number; start: number; length: number; velocity: number }[];
}

export interface MidiFileData {
  bpm: number;
  timeSig: [number, number];
  tracks: MidiTrackData[];
}

function vlq(n: number): number[] {
  let v = Math.max(0, Math.round(n));
  const bytes = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

function ascii(s: string): number[] {
  return [...s].map((c) => c.charCodeAt(0) & 0x7f);
}

function u32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function chunk(type: string, data: number[]): number[] {
  return [...ascii(type), ...u32(data.length), ...data];
}

export function writeMidi(file: MidiFileData): Uint8Array {
  const tracks: number[][] = [];
  const mpqn = Math.round(60_000_000 / file.bpm);
  const den = Math.round(Math.log2(file.timeSig[1]));
  tracks.push([
    0x00, 0xff, 0x51, 0x03, (mpqn >> 16) & 0xff, (mpqn >> 8) & 0xff, mpqn & 0xff,
    0x00, 0xff, 0x58, 0x04, file.timeSig[0], den, 24, 8,
    0x00, 0xff, 0x2f, 0x00,
  ]);
  file.tracks.forEach((t, i) => {
    const ch = i % 16 === 9 ? (i + 1) % 16 : i % 16;
    const events: { tick: number; bytes: number[]; order: number }[] = [];
    for (const n of t.notes) {
      const vel = Math.max(1, Math.min(127, Math.round(n.velocity * 127)));
      events.push({ tick: Math.round(n.start), bytes: [0x90 | ch, n.pitch & 0x7f, vel], order: 1 });
      events.push({ tick: Math.round(n.start + n.length), bytes: [0x80 | ch, n.pitch & 0x7f, 0], order: 0 });
    }
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const name = ascii(t.name.slice(0, 120));
    const data: number[] = [0x00, 0xff, 0x03, ...vlq(name.length), ...name];
    let last = 0;
    for (const e of events) {
      data.push(...vlq(e.tick - last), ...e.bytes);
      last = e.tick;
    }
    data.push(0x00, 0xff, 0x2f, 0x00);
    tracks.push(data);
  });
  const header = chunk('MThd', [0, 1, 0, tracks.length & 0xff, (PPQ >> 8) & 0xff, PPQ & 0xff]);
  // Track count can exceed 255.
  header[10] = (tracks.length >> 8) & 0xff;
  header[11] = tracks.length & 0xff;
  return new Uint8Array([...header, ...tracks.flatMap((t) => chunk('MTrk', t))]);
}

export function readMidi(bytes: Uint8Array): MidiFileData {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;
  const readStr = (n: number) => {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[pos + i]);
    pos += n;
    return s;
  };
  if (readStr(4) !== 'MThd') throw new Error('Это не MIDI-файл');
  const hlen = v.getUint32(pos);
  pos += 4;
  const ntracks = v.getUint16(pos + 2);
  const division = v.getUint16(pos + 4);
  pos += hlen;
  if (division & 0x8000) throw new Error('SMPTE-тайминг не поддерживается');
  const scale = PPQ / division;

  const result: MidiFileData = { bpm: 120, timeSig: [4, 4], tracks: [] };
  for (let t = 0; t < ntracks && pos < bytes.length; t++) {
    const type = readStr(4);
    const len = v.getUint32(pos);
    pos += 4;
    const end = pos + len;
    if (type !== 'MTrk') {
      pos = end;
      continue;
    }
    const readVlq = () => {
      let n = 0;
      let b: number;
      do {
        b = bytes[pos++];
        n = (n << 7) | (b & 0x7f);
      } while (b & 0x80 && pos < end);
      return n;
    };
    let tick = 0;
    let status = 0;
    let name = `Track ${t + 1}`;
    const open = new Map<number, { start: number; velocity: number }>();
    const notes: MidiTrackData['notes'] = [];
    while (pos < end) {
      tick += readVlq();
      let b = bytes[pos];
      if (b & 0x80) {
        status = b;
        pos++;
      } else {
        b = status;
      }
      if (status === 0xff) {
        const meta = bytes[pos++];
        const mlen = readVlq();
        if (meta === 0x03) name = readStr(mlen).trim() || name;
        else {
          if (meta === 0x51 && mlen === 3) result.bpm = Math.round(60_000_000 / ((bytes[pos] << 16) | (bytes[pos + 1] << 8) | bytes[pos + 2]));
          if (meta === 0x58 && mlen >= 2) result.timeSig = [bytes[pos], Math.pow(2, bytes[pos + 1])];
          pos += mlen;
        }
        continue;
      }
      if (status === 0xf0 || status === 0xf7) {
        pos += readVlq();
        continue;
      }
      const cmd = status & 0xf0;
      const ch = status & 0x0f;
      const d1 = bytes[pos++];
      const d2 = cmd === 0xc0 || cmd === 0xd0 ? 0 : bytes[pos++];
      const key = ch * 128 + d1;
      if (cmd === 0x90 && d2 > 0) {
        open.set(key, { start: tick, velocity: d2 / 127 });
      } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
        const o = open.get(key);
        if (o) {
          notes.push({ pitch: d1, start: Math.round(o.start * scale), length: Math.max(1, Math.round((tick - o.start) * scale)), velocity: o.velocity });
          open.delete(key);
        }
      }
    }
    pos = end;
    if (notes.length) result.tracks.push({ name, notes: notes.sort((a, b) => a.start - b.start) });
  }
  return result;
}

export function notesToTrack(name: string, notes: Note[]): MidiTrackData {
  return { name, notes: notes.map(({ pitch, start, length, velocity }) => ({ pitch, start, length, velocity })) };
}
