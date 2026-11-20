import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { isBlackKey, noteName, patternLengthTicks, snapTick, ticksPerBar, ticksPerBeat, uid } from '../../core/music';
import { PPQ, type Note } from '../../core/types';
import * as A from '../../state/actions';
import { engine, openMenu, patchUi, project, ui, useCurrentPatternId, useProject, useSelectedChannelId, useUi, type PianoTool } from '../../state/app';
import { Icon } from '../components/Icon';
import { onFrame } from '../frame';
import { cx } from '../util';

const KEYW = 64;
const RULER = 22;
const VEL_H = 64;

export const SNAPS: { label: string; ticks: number }[] = [
  { label: 'Без привязки', ticks: 1 },
  { label: '1/64', ticks: PPQ / 16 },
  { label: '1/32', ticks: PPQ / 8 },
  { label: '1/16 T', ticks: PPQ / 6 },
  { label: '1/16', ticks: PPQ / 4 },
  { label: '1/8 T', ticks: PPQ / 3 },
  { label: '1/8', ticks: PPQ / 2 },
  { label: '1/4', ticks: PPQ },
  { label: '1/2', ticks: PPQ * 2 },
  { label: 'Такт', ticks: PPQ * 4 },
];

const CHORDS: Record<string, number[]> = {
  none: [0],
  major: [0, 4, 7],
  minor: [0, 3, 7],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  sus4: [0, 5, 7],
  power: [0, 7, 12],
  octave: [0, 12],
};

type Drag =
  | { kind: 'move'; origin: Note[]; ids: Set<string>; startTick: number; startPitch: number; anchor: Note; key: string; lastPitch: number }
  | { kind: 'resize'; origin: Note[]; ids: Set<string>; startTick: number; key: string }
  | { kind: 'band'; x0: number; y0: number; x1: number; y1: number; base: Set<string> }
  | { kind: 'erase'; key: string }
  | { kind: 'keys'; pitch: number }
  | { kind: 'velocity'; key: string }
  | { kind: 'pan'; sx: number; sy: number; left: number; top: number };

let clipboard: Note[] = [];

export function PianoRoll() {
  const channels = useProject((p) => p.channels);
  const patterns = useProject((p) => p.patterns);
  const timeSig = useProject((p) => p.timeSig);
  const patternId = useCurrentPatternId();
  const channelId = useSelectedChannelId();
  const piano = useUi((u) => u.piano);
  const pattern = patterns.find((p) => p.id === patternId);
  const channel = channels.find((c) => c.id === channelId);
  const notes = (pattern && channel && pattern.notes[channel.id]) || EMPTY;

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const velRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [chord, setChord] = useState('none');
  const dirty = useRef(true);
  const drag = useRef<Drag | null>(null);
  const lastLen = useRef(PPQ / 4);
  const touches = useRef(new Map<number, { x: number; y: number }>());

  const pxPerTick = (64 * piano.zoomX) / PPQ;
  const rowH = Math.round(14 * piano.zoomY);
  const patLen = pattern ? patternLengthTicks(pattern, timeSig) : ticksPerBar(timeSig);
  const contentEnd = Math.max(patLen, ...notes.map((n) => n.start + n.length));
  const totalTicks = Math.ceil((contentEnd + ticksPerBar(timeSig) * 4) / ticksPerBar(timeSig)) * ticksPerBar(timeSig);
  const width = totalTicks * pxPerTick;
  const height = 128 * rowH;

  // Everything the draw loop needs, refreshed each render.
  const view = useRef({ notes, pattern, channel, channels, piano, pxPerTick, rowH, patLen, timeSig, width, height, size, chord });
  view.current = { notes, pattern, channel, channels, piano, pxPerTick, rowH, patLen, timeSig, width, height, size, chord };
  dirty.current = true;

  const selection = new Set(piano.selection);
  const setSelection = (ids: Iterable<string>) => patchUi({ piano: { ...ui.get().piano, selection: [...ids] } });
  const commit = useCallback(
    (next: Note[], key?: string) => {
      if (pattern && channel) A.setNotes(pattern.id, channel.id, next, key);
    },
    [pattern, channel],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    // Start centred around the notes (or C5).
    const mid = notes.length ? notes.reduce((s, n) => s + n.pitch, 0) / notes.length : 66;
    el.scrollTop = Math.max(0, (127 - mid) * rowH - el.clientHeight / 2);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId]);

  // ------------------------------------------------------------ drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    const vel = velRef.current;
    if (!canvas || !vel) return;
    const ctx = canvas.getContext('2d');
    const vctx = vel.getContext('2d');
    if (!ctx || !vctx) return;
    const css = getComputedStyle(document.documentElement);
    const col = (n: string, d: string) => css.getPropertyValue(n).trim() || d;
    const C = {
      bg: col('--pr-white', '#262a31'),
      black: col('--pr-black', '#1f2227'),
      line: 'rgba(255,255,255,0.05)',
      beat: 'rgba(255,255,255,0.10)',
      bar: 'rgba(255,255,255,0.22)',
      out: 'rgba(0,0,0,0.28)',
      text: col('--text-dim', '#8b95a1'),
      play: col('--playhead', '#4ade80'),
    };
    let lastPlayX = -1;
    return onFrame(() => {
      const v = view.current;
      const el = scrollRef.current;
      if (!el) return;
      const playing = engine.s.playing;
      let playTick = -1;
      if (playing && v.pattern) {
        let t = engine.playheadTick();
        if (engine.s.mode === 'song') {
          const clip = project.get().clips.find((c) => c.kind === 'pattern' && c.patternId === v.pattern!.id && t >= c.start && t < c.start + c.length);
          t = clip ? (t - clip.start) % v.patLen : -1;
        }
        playTick = t;
      }
      const playX = playTick >= 0 ? Math.round(playTick * v.pxPerTick) : -1;
      if (!dirty.current && playX === lastPlayX) return;
      dirty.current = false;
      lastPlayX = playX;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = v.size.w;
      const H = v.size.h;
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sl = el.scrollLeft;
      const st = el.scrollTop;
      const gw = W - KEYW;
      const gh = H - RULER;
      const t0 = sl / v.pxPerTick;
      const t1 = (sl + gw) / v.pxPerTick;
      const p0 = 127 - Math.floor(st / v.rowH);
      const p1 = 127 - Math.ceil((st + gh) / v.rowH);
      const xOf = (tick: number) => KEYW + tick * v.pxPerTick - sl;
      const yOf = (pitch: number) => RULER + (127 - pitch) * v.rowH - st;

      // Rows.
      ctx.fillStyle = C.bg;
      ctx.fillRect(KEYW, RULER, gw, gh);
      for (let p = p0; p >= Math.max(0, p1); p--) {
        const y = yOf(p);
        if (isBlackKey(p)) {
          ctx.fillStyle = C.black;
          ctx.fillRect(KEYW, y, gw, v.rowH);
        }
        if (p % 12 === 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.09)';
          ctx.fillRect(KEYW, y + v.rowH - 1, gw, 1);
        }
      }
      // Vertical grid.
      const beat = ticksPerBeat(v.timeSig);
      const bar = ticksPerBar(v.timeSig);
      const snap = Math.max(v.piano.snap, beat / 4);
      const minor = snap * v.pxPerTick < 6 ? beat : snap;
      for (let t = Math.floor(t0 / minor) * minor; t <= t1; t += minor) {
        const x = Math.round(xOf(t)) + 0.5;
        ctx.fillStyle = t % bar === 0 ? C.bar : t % beat === 0 ? C.beat : C.line;
        ctx.fillRect(x, RULER, 1, gh);
      }
      // Beyond the pattern end.
      const endX = xOf(v.patLen);
      if (endX < W) {
        ctx.fillStyle = C.out;
        ctx.fillRect(Math.max(KEYW, endX), RULER, W - Math.max(KEYW, endX), gh);
      }

      // Ghost notes from other channels.
      if (v.piano.ghost && v.pattern) {
        ctx.fillStyle = 'rgba(200,210,225,0.13)';
        for (const [cid, list] of Object.entries(v.pattern.notes)) {
          if (cid === v.channel?.id) continue;
          for (const n of list) {
            if (n.start > t1 || n.start + n.length < t0 || n.pitch > p0 + 1 || n.pitch < p1 - 1) continue;
            ctx.fillRect(xOf(n.start), yOf(n.pitch) + 1, Math.max(2, n.length * v.pxPerTick - 1), v.rowH - 2);
          }
        }
      }

      // Notes.
      const color = v.channel?.color ?? '#7e7fe8';
      const sel = new Set(v.piano.selection);
      ctx.font = `${Math.max(9, Math.min(11, v.rowH - 4))}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      for (const n of v.notes) {
        if (n.start > t1 || n.start + n.length < t0 || n.pitch > p0 + 1 || n.pitch < p1 - 1) continue;
        const x = xOf(n.start);
        const y = yOf(n.pitch);
        const w = Math.max(3, n.length * v.pxPerTick - 1);
        const h = v.rowH - 1;
        ctx.globalAlpha = 0.45 + n.velocity * 0.55;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = sel.has(n.id) ? '#ffffff' : 'rgba(0,0,0,0.45)';
        ctx.lineWidth = sel.has(n.id) ? 2 : 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        if (w > 26 && h >= 10) {
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillText(noteName(n.pitch), x + 4, y + h / 2 + 0.5);
        }
      }

      // Rubber band.
      const d = drag.current;
      if (d?.kind === 'band') {
        ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.strokeRect(Math.min(d.x0, d.x1) - sl + KEYW, Math.min(d.y0, d.y1) - st + RULER, Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0));
        ctx.setLineDash([]);
      }

      // Playhead.
      if (playX >= 0) {
        const x = KEYW + playX - sl;
        if (x >= KEYW && x <= W) {
          ctx.fillStyle = C.play;
          ctx.fillRect(x, RULER, 1.5, gh);
        }
      }

      // Ruler.
      ctx.fillStyle = '#1b1e23';
      ctx.fillRect(KEYW, 0, gw, RULER);
      ctx.fillStyle = C.text;
      ctx.font = '10px system-ui, sans-serif';
      for (let t = Math.floor(t0 / beat) * beat; t <= t1; t += beat) {
        const x = Math.round(xOf(t));
        if (t % bar === 0) {
          ctx.fillRect(x, 8, 1, RULER - 8);
          ctx.fillText(String(t / bar + 1), x + 3, 11);
        } else {
          ctx.fillRect(x, RULER - 5, 1, 5);
        }
      }
      if (playX >= 0) {
        ctx.fillStyle = C.play;
        const x = KEYW + playX - sl;
        ctx.beginPath();
        ctx.moveTo(x - 5, 0);
        ctx.lineTo(x + 5, 0);
        ctx.lineTo(x, 8);
        ctx.fill();
      }

      // Keyboard.
      ctx.fillStyle = '#e9ecef';
      ctx.fillRect(0, RULER, KEYW, gh);
      for (let p = p0; p >= Math.max(0, p1); p--) {
        const y = yOf(p);
        const held = d?.kind === 'keys' && d.pitch === p;
        if (isBlackKey(p)) {
          ctx.fillStyle = held ? color : '#23262b';
          ctx.fillRect(0, y, KEYW * 0.62, v.rowH);
        } else if (held) {
          ctx.fillStyle = color;
          ctx.fillRect(0, y, KEYW, v.rowH);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, y + v.rowH - 0.5, KEYW, 0.5);
        if (p % 12 === 0) {
          ctx.fillStyle = '#5a6270';
          ctx.font = '10px system-ui, sans-serif';
          ctx.fillText(noteName(p), KEYW - 26, y + v.rowH / 2 + 0.5);
        }
      }
      ctx.fillStyle = '#16181c';
      ctx.fillRect(0, 0, KEYW, RULER);

      // Velocity lane.
      const vw = W;
      if (vel.width !== Math.round(vw * dpr) || vel.height !== Math.round(VEL_H * dpr)) {
        vel.width = Math.round(vw * dpr);
        vel.height = Math.round(VEL_H * dpr);
        vel.style.width = `${vw}px`;
        vel.style.height = `${VEL_H}px`;
      }
      vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      vctx.fillStyle = '#1b1e23';
      vctx.fillRect(0, 0, vw, VEL_H);
      vctx.fillStyle = C.text;
      vctx.font = '10px system-ui, sans-serif';
      vctx.fillText('Velocity', 6, 12);
      for (const n of v.notes) {
        const x = xOf(n.start);
        if (x < KEYW - 4 || x > vw) continue;
        const h = n.velocity * (VEL_H - 8);
        vctx.fillStyle = sel.has(n.id) ? '#ffffff' : color;
        vctx.fillRect(x, VEL_H - h, 3, h);
        vctx.beginPath();
        vctx.arc(x + 1.5, VEL_H - h, 3, 0, Math.PI * 2);
        vctx.fill();
      }
    });
  }, []);

  // ------------------------------------------------------------ hit testing
  const toContent = (e: { clientX: number; clientY: number }) => {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    return { x, y, cx: x - KEYW + el.scrollLeft, cy: y - RULER + el.scrollTop };
  };
  const tickAt = (cxv: number) => Math.max(0, cxv / pxPerTick);
  const pitchAt = (cyv: number) => Math.max(0, Math.min(127, 127 - Math.floor(cyv / rowH)));
  const noteAt = (cxv: number, cyv: number): Note | undefined => {
    const t = tickAt(cxv);
    const p = pitchAt(cyv);
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (n.pitch === p && t >= n.start && t < n.start + n.length) return n;
    }
    return undefined;
  };
  const preview = (pitch: number, velocity = 0.8) => {
    if (!channel) return;
    engine.noteOn(channel.id, pitch, velocity);
    setTimeout(() => engine.noteOff(channel.id, pitch), 160);
  };

  // ------------------------------------------------------------ pointer handlers
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pattern || !channel) return;
    const pt = toContent(e);
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) {
        // Two fingers: abort the edit and pan instead.
        if (drag.current && 'origin' in drag.current) commit(drag.current.origin, drag.current.key);
        const el = scrollRef.current!;
        drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, left: el.scrollLeft, top: el.scrollTop };
        return;
      }
    }
    if (piano.tool === 'scroll' && pt.x >= KEYW) {
      // Touch scrolls natively in this mode; the mouse drags the view.
      if (e.pointerType === 'mouse') {
        e.currentTarget.setPointerCapture(e.pointerId);
        const el = scrollRef.current!;
        drag.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      }
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);

    if (pt.x < KEYW && pt.y >= RULER) {
      const pitch = pitchAt(pt.cy);
      drag.current = { kind: 'keys', pitch };
      engine.noteOn(channel.id, pitch, 0.85);
      dirty.current = true;
      return;
    }
    if (pt.y < RULER) {
      if (engine.s.mode === 'pattern') engine.seek(snapTick(tickAt(pt.cx), piano.snap, 'floor'));
      return;
    }

    const hit = noteAt(pt.cx, pt.cy);
    const tool: PianoTool = e.button === 2 ? 'erase' : piano.tool;
    const key = `pr-${uid()}`;

    if (tool === 'erase') {
      drag.current = { kind: 'erase', key };
      if (hit) commit(notes.filter((n) => n.id !== hit.id), key);
      return;
    }

    if (hit) {
      const edgePx = e.pointerType === 'touch' ? 14 : 7;
      const rightEdge = (hit.start + hit.length) * pxPerTick;
      let ids = selection.has(hit.id) ? new Set(selection) : new Set([hit.id]);
      if (e.shiftKey && tool === 'select') {
        ids = new Set(selection);
        if (ids.has(hit.id)) ids.delete(hit.id);
        else ids.add(hit.id);
      }
      setSelection(ids);
      lastLen.current = hit.length;
      if (rightEdge - pt.cx < edgePx && rightEdge - pt.cx >= -1) {
        drag.current = { kind: 'resize', origin: notes, ids, startTick: tickAt(pt.cx), key };
      } else {
        let origin = notes;
        if (e.ctrlKey || e.metaKey) {
          // Ctrl-drag duplicates the dragged notes.
          const copies = notes.filter((n) => ids.has(n.id)).map((n) => ({ ...n, id: uid('n') }));
          origin = [...notes, ...copies];
          ids = new Set(copies.map((c) => c.id));
          setSelection(ids);
        }
        drag.current = { kind: 'move', origin, ids, startTick: tickAt(pt.cx), startPitch: pitchAt(pt.cy), anchor: hit, key, lastPitch: hit.pitch };
        preview(hit.pitch, hit.velocity);
      }
      return;
    }

    if (tool === 'select') {
      drag.current = { kind: 'band', x0: pt.cx, y0: pt.cy, x1: pt.cx, y1: pt.cy, base: e.shiftKey ? new Set(selection) : new Set() };
      if (!e.shiftKey) setSelection([]);
      return;
    }

    // Draw: create note(s) then drag to move.
    const start = snapTick(tickAt(pt.cx), piano.snap, 'floor');
    const pitch = pitchAt(pt.cy);
    const len = lastLen.current;
    const created = (CHORDS[chord] ?? [0]).filter((iv) => pitch + iv <= 127).map((iv) => ({ id: uid('n'), pitch: pitch + iv, start, length: len, velocity: 0.8 }));
    const next = [...notes, ...created];
    commit(next, key);
    const ids = new Set(created.map((n) => n.id));
    setSelection(ids);
    drag.current = { kind: 'move', origin: next, ids, startTick: tickAt(pt.cx), startPitch: pitch, anchor: created[0], key, lastPitch: pitch };
    created.forEach((n) => preview(n.pitch));
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!d) {
      // Cursor feedback.
      const pt = toContent(e);
      const hit = pt.x >= KEYW && pt.y >= RULER ? noteAt(pt.cx, pt.cy) : undefined;
      const edge = hit && (hit.start + hit.length) * pxPerTick - pt.cx < 7;
      e.currentTarget.style.cursor = piano.tool === 'scroll' ? 'grab' : edge ? 'ew-resize' : hit ? 'move' : piano.tool === 'erase' ? 'not-allowed' : piano.tool === 'select' ? 'crosshair' : 'copy';
      return;
    }
    const pt = toContent(e);
    if (d.kind === 'pan') {
      const el = scrollRef.current!;
      el.scrollLeft = d.left - (e.clientX - d.sx);
      el.scrollTop = d.top - (e.clientY - d.sy);
      return;
    }
    if (d.kind === 'keys') {
      const p = pitchAt(pt.cy);
      if (p !== d.pitch && channel) {
        engine.noteOff(channel.id, d.pitch);
        engine.noteOn(channel.id, p, 0.85);
        d.pitch = p;
        dirty.current = true;
      }
      return;
    }
    if (d.kind === 'erase') {
      const hit = noteAt(pt.cx, pt.cy);
      if (hit) commit(notes.filter((n) => n.id !== hit.id), d.key);
      return;
    }
    if (d.kind === 'band') {
      d.x1 = pt.cx;
      d.y1 = pt.cy;
      const ta = tickAt(Math.min(d.x0, d.x1));
      const tb = tickAt(Math.max(d.x0, d.x1));
      const pa = pitchAt(Math.max(d.y0, d.y1));
      const pb = pitchAt(Math.min(d.y0, d.y1));
      const ids = new Set(d.base);
      for (const n of notes) if (n.start < tb && n.start + n.length > ta && n.pitch >= pa && n.pitch <= pb) ids.add(n.id);
      setSelection(ids);
      dirty.current = true;
      return;
    }
    if (d.kind === 'move') {
      const snap = e.altKey ? 1 : piano.snap;
      const dt = snapTick(d.anchor.start + (tickAt(pt.cx) - d.startTick), snap) - d.anchor.start;
      const dp = pitchAt(pt.cy) - d.startPitch;
      const moving = d.origin.filter((n) => d.ids.has(n.id));
      const minStart = Math.min(...moving.map((n) => n.start));
      const minP = Math.min(...moving.map((n) => n.pitch));
      const maxP = Math.max(...moving.map((n) => n.pitch));
      const ddt = Math.max(-minStart, dt);
      const ddp = Math.max(-minP, Math.min(127 - maxP, dp));
      commit(d.origin.map((n) => (d.ids.has(n.id) ? { ...n, start: n.start + ddt, pitch: n.pitch + ddp } : n)), d.key);
      const np = d.anchor.pitch + ddp;
      if (np !== d.lastPitch) {
        d.lastPitch = np;
        preview(np, d.anchor.velocity);
      }
      return;
    }
    if (d.kind === 'resize') {
      const snap = e.altKey ? 1 : piano.snap;
      const delta = tickAt(pt.cx) - d.startTick;
      const next = d.origin.map((n) => {
        if (!d.ids.has(n.id)) return n;
        const end = snapTick(n.start + n.length + delta, snap);
        return { ...n, length: Math.max(Math.max(1, snap === 1 ? 6 : snap), end - n.start) };
      });
      commit(next, d.key);
      const first = next.find((n) => d.ids.has(n.id));
      if (first) lastLen.current = first.length;
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    touches.current.delete(e.pointerId);
    const d = drag.current;
    if (d?.kind === 'keys' && channel) engine.noteOff(channel.id, d.pitch);
    if (d?.kind === 'pan' && touches.current.size > 0) return;
    drag.current = null;
    dirty.current = true;
    project.breakCoalescing();
  };

  // Velocity lane editing.
  const onVelPointer = (e: React.PointerEvent<HTMLCanvasElement>, down: boolean) => {
    if (down) {
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { kind: 'velocity', key: `vel-${uid()}` };
    }
    const d = drag.current;
    if (d?.kind !== 'velocity') return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const vel = Math.max(0.02, Math.min(1, (VEL_H - (e.clientY - r.top)) / (VEL_H - 8)));
    const el = scrollRef.current!;
    const tick = (x - KEYW + el.scrollLeft) / pxPerTick;
    const tol = 6 / pxPerTick;
    const target = selection.size ? notes.filter((n) => selection.has(n.id)) : notes;
    const hits = new Set(target.filter((n) => Math.abs(n.start - tick) <= tol).map((n) => n.id));
    if (!hits.size) return;
    commit(notes.map((n) => (hits.has(n.id) ? { ...n, velocity: vel } : n)), d.key);
  };

  // ------------------------------------------------------------ keyboard + commands
  const selected = () => notes.filter((n) => selection.has(n.id));
  const cmd = {
    deleteSel: () => {
      commit(notes.filter((n) => !selection.has(n.id)));
      setSelection([]);
    },
    selectAll: () => setSelection(notes.map((n) => n.id)),
    copy: () => {
      clipboard = selected().map((n) => ({ ...n }));
    },
    cut: () => {
      cmd.copy();
      cmd.deleteSel();
    },
    paste: () => {
      if (!clipboard.length) return;
      const minStart = Math.min(...clipboard.map((n) => n.start));
      const maxEnd = Math.max(...clipboard.map((n) => n.start + n.length));
      const sel = selected();
      const at = sel.length ? Math.max(...sel.map((n) => n.start + n.length)) : snapTick(engine.s.playing ? 0 : engine.s.startTick % patLen, piano.snap);
      const shift = sel.length ? Math.ceil((at - minStart) / (maxEnd - minStart || 1)) * (maxEnd - minStart) : at - minStart;
      const pasted = clipboard.map((n) => ({ ...n, id: uid('n'), start: n.start + shift }));
      commit([...notes, ...pasted]);
      setSelection(pasted.map((n) => n.id));
    },
    duplicate: () => {
      const sel = selected();
      if (!sel.length) return;
      const span = Math.max(...sel.map((n) => n.start + n.length)) - Math.min(...sel.map((n) => n.start));
      const copies = sel.map((n) => ({ ...n, id: uid('n'), start: n.start + span }));
      commit([...notes, ...copies]);
      setSelection(copies.map((n) => n.id));
    },
    transpose: (semis: number) => {
      const ids = selection.size ? selection : new Set(notes.map((n) => n.id));
      commit(notes.map((n) => (ids.has(n.id) ? { ...n, pitch: Math.max(0, Math.min(127, n.pitch + semis)) } : n)), 'transpose');
    },
    nudge: (ticks: number) => {
      const ids = selection.size ? selection : new Set<string>();
      commit(notes.map((n) => (ids.has(n.id) ? { ...n, start: Math.max(0, n.start + ticks) } : n)), 'nudge');
    },
    quantize: () => {
      const ids = selection.size ? selection : new Set(notes.map((n) => n.id));
      const q = Math.max(1, piano.snap);
      commit(notes.map((n) => (ids.has(n.id) ? { ...n, start: snapTick(n.start, q), length: Math.max(q, snapTick(n.length, q)) } : n)));
    },
    legato: () => {
      const ids = selection.size ? selection : new Set(notes.map((n) => n.id));
      const starts = [...new Set(notes.filter((n) => ids.has(n.id)).map((n) => n.start))].sort((a, b) => a - b);
      commit(
        notes.map((n) => {
          if (!ids.has(n.id)) return n;
          const next = starts.find((s) => s > n.start);
          return { ...n, length: (next ?? Math.max(n.start + n.length, patLen)) - n.start };
        }),
      );
    },
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ui.get().view !== 'piano' && ui.get().split !== 'piano') return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
      const mod = e.ctrlKey || e.metaKey;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size) cmd.deleteSel();
      else if (mod && e.key.toLowerCase() === 'a') cmd.selectAll();
      else if (mod && e.key.toLowerCase() === 'c') cmd.copy();
      else if (mod && e.key.toLowerCase() === 'x') cmd.cut();
      else if (mod && e.key.toLowerCase() === 'v') cmd.paste();
      else if (mod && e.key.toLowerCase() === 'b') cmd.duplicate();
      else if (e.key === 'ArrowUp' && selection.size) cmd.transpose(e.shiftKey ? 12 : 1);
      else if (e.key === 'ArrowDown' && selection.size) cmd.transpose(e.shiftKey ? -12 : -1);
      else if (e.key === 'ArrowLeft' && selection.size) cmd.nudge(-piano.snap);
      else if (e.key === 'ArrowRight' && selection.size) cmd.nudge(piano.snap);
      else if (!mod && e.key.toLowerCase() === 'q' && !ui.get().typingKeyboard) cmd.quantize();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const setPiano = (p: Partial<typeof piano>) => patchUi({ piano: { ...ui.get().piano, ...p } });
  const zoom = (fx: number, fy = 1) => setPiano({ zoomX: Math.min(8, Math.max(0.15, piano.zoomX * fx)), zoomY: Math.min(2.4, Math.max(0.6, piano.zoomY * fy)) });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const s = ui.get().piano;
        patchUi({ piano: { ...s, zoomX: Math.min(8, Math.max(0.15, s.zoomX * f)) } });
      }
    };
    const onScroll = () => (dirty.current = true);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('scroll', onScroll);
    };
  }, []);

  if (!pattern || !channel) return <div className="empty">Выберите канал в Channel Rack, чтобы редактировать ноты</div>;

  const tools: { id: PianoTool; icon: string; label: string }[] = [
    { id: 'draw', icon: 'pencil', label: 'Рисование (P)' },
    { id: 'select', icon: 'cursor', label: 'Выделение (E)' },
    { id: 'erase', icon: 'eraser', label: 'Ластик (D)' },
    { id: 'scroll', icon: 'hand', label: 'Прокрутка' },
  ];

  return (
    <div className="piano">
      <div className="panel-toolbar">
        <select
          value={channel.id}
          onChange={(e) => {
            patchUi({ selectedChannelId: e.target.value, piano: { ...piano, selection: [] } });
            engine.setLiveChannel(e.target.value);
          }}
          aria-label="Канал"
          className="ch-select"
          style={{ borderColor: channel.color }}
        >
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="seg">
          {tools.map((t) => (
            <button key={t.id} className={cx(piano.tool === t.id && 'on')} onClick={() => setPiano({ tool: t.id })} title={t.label} aria-label={t.label}>
              <Icon name={t.icon} size={16} />
            </button>
          ))}
        </div>
        <label className="inline-field" title="Привязка к сетке">
          <Icon name="magnet" size={14} />
          <select value={piano.snap} onChange={(e) => setPiano({ snap: Number(e.target.value) })}>
            {SNAPS.map((s) => (
              <option key={s.ticks} value={s.ticks}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-field" title="Рисовать аккордами">
          <span className="hide-mobile">Аккорд</span>
          <select value={chord} onChange={(e) => setChord(e.target.value)}>
            {Object.keys(CHORDS).map((k) => (
              <option key={k} value={k}>
                {{ none: '—', major: 'Мажор', minor: 'Минор', maj7: 'Maj7', min7: 'Min7', dom7: 'Dom7', sus4: 'Sus4', power: 'Квинта', octave: 'Октава' }[k]}
              </option>
            ))}
          </select>
        </label>
        <button className={cx('icon-btn hide-mobile', piano.ghost && 'active')} onClick={() => setPiano({ ghost: !piano.ghost })} title="Призрачные ноты других каналов" aria-pressed={piano.ghost}>
          <Icon name="ghost" size={16} />
        </button>
        <button className="icon-btn" onClick={() => zoom(1 / 1.3)} title="Уменьшить масштаб" aria-label="Уменьшить">
          <Icon name="zoomOut" size={16} />
        </button>
        <button className="icon-btn" onClick={() => zoom(1.3)} title="Увеличить масштаб" aria-label="Увеличить">
          <Icon name="zoomIn" size={16} />
        </button>
        <button className="icon-btn hide-mobile" onClick={() => zoom(1, 1.2)} title="Выше клавиши" aria-label="Выше клавиши">
          <Icon name="chevronUp" size={16} />
        </button>
        <button className="icon-btn hide-mobile" onClick={() => zoom(1, 1 / 1.2)} title="Ниже клавиши" aria-label="Ниже клавиши">
          <Icon name="chevronDown" size={16} />
        </button>
        <button
          className="btn"
          onClick={(e) =>
            openMenu(e.clientX, e.clientY, [
              { label: 'Выделить всё', hint: 'Ctrl+A', action: cmd.selectAll },
              { label: 'Копировать', hint: 'Ctrl+C', action: cmd.copy, disabled: !selection.size },
              { label: 'Вырезать', hint: 'Ctrl+X', action: cmd.cut, disabled: !selection.size },
              { label: 'Вставить', hint: 'Ctrl+V', action: cmd.paste, disabled: !clipboard.length },
              { label: 'Дублировать', hint: 'Ctrl+B', action: cmd.duplicate, disabled: !selection.size },
              { label: 'Удалить выделенное', hint: 'Del', action: cmd.deleteSel, disabled: !selection.size },
              { separator: true, label: '' },
              { label: 'Квантизировать', hint: 'Q', action: cmd.quantize },
              { label: 'Легато', action: cmd.legato },
              { label: 'Транспонировать +1', hint: '↑', action: () => cmd.transpose(1) },
              { label: 'Транспонировать −1', hint: '↓', action: () => cmd.transpose(-1) },
              { label: 'Октава вверх', hint: 'Shift+↑', action: () => cmd.transpose(12) },
              { label: 'Октава вниз', hint: 'Shift+↓', action: () => cmd.transpose(-12) },
              { separator: true, label: '' },
              { label: 'Очистить паттерн для канала', danger: true, action: () => commit([]) },
            ])
          }
        >
          Правка
        </button>
        {selection.size > 0 && (
          <button className="icon-btn" onClick={cmd.deleteSel} title="Удалить выделенные" aria-label="Удалить выделенные">
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
      <div className="pr-scroll" ref={scrollRef}>
        <div style={{ width: KEYW + width, height: RULER + height, position: 'relative' }}>
          <canvas
            ref={canvasRef}
            className={cx('pr-canvas', piano.tool === 'scroll' && 'scroll-mode')}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      </div>
      <canvas ref={velRef} className="pr-vel" onPointerDown={(e) => onVelPointer(e, true)} onPointerMove={(e) => e.buttons && onVelPointer(e, false)} onPointerUp={() => (drag.current = null)} />
    </div>
  );
}

const EMPTY: Note[] = [];
