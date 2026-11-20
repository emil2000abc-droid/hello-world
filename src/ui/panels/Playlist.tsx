import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { targetExists } from '../../core/automation';
import { patternLengthTicks, secondsPerTick, snapTick, songLengthTicks, ticksPerBar, ticksPerBeat, uid } from '../../core/music';
import { PPQ, type AudioClip, type AutomationClip, type Clip, type ID, type Pattern, type PatternClip, type Project } from '../../core/types';
import { bufferPeaks } from '../../audio/wav';
import * as A from '../../state/actions';
import { askText, engine, openMenu, openWindow, patchUi, project, setView, ui, useCurrentPatternId, useEngine, useProject, useUi, type PlaylistTool } from '../../state/app';
import { importAudioFiles } from '../../state/persistence';
import { Icon } from '../components/Icon';
import { DND_TYPE, type DragItem } from './Browser';
import { onFrame } from '../frame';
import { cx } from '../util';

const ROW_H = 46;
const HEAD_W = 132;
const RULER_H = 26;

const PL_SNAPS = [
  { label: 'Такт', ticks: PPQ * 4 },
  { label: 'Доля', ticks: PPQ },
  { label: '1/2 доли', ticks: PPQ / 2 },
  { label: 'Шаг', ticks: PPQ / 4 },
  { label: 'Без привязки', ticks: 1 },
];

type Drag =
  | { kind: 'move'; ids: ID[]; origin: Map<ID, { start: number; trackIdx: number }>; x0: number; y0: number; anchorStart: number; key: string; moved: boolean }
  | { kind: 'resize-r' | 'resize-l'; id: ID; origin: Clip; x0: number; key: string }
  | { kind: 'band'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'ruler'; x0: number; t0: number; moved: boolean };

function PatternPreview({ pattern, clip, timeSig, pxPerTick }: { pattern: Pattern; clip: PatternClip; timeSig: [number, number]; pxPerTick: number }) {
  const len = patternLengthTicks(pattern, timeSig);
  const all = Object.values(pattern.notes).flat();
  const rects = useMemo(() => {
    if (!all.length) return null;
    const lo = Math.min(...all.map((n) => n.pitch));
    const hi = Math.max(...all.map((n) => n.pitch));
    const range = Math.max(8, hi - lo + 1);
    const out: { x: number; y: number; w: number }[] = [];
    for (let rep = 0; rep * len < clip.length && out.length < 1500; rep++) {
      for (const n of all) {
        const t = rep * len + n.start;
        if (t >= clip.length || n.start >= len) continue;
        out.push({ x: t, y: (hi - n.pitch) / range, w: Math.min(n.length, clip.length - t) });
      }
    }
    return { out, range };
  }, [pattern, clip.length, len]);
  if (!rects) return null;
  const w = clip.length * pxPerTick;
  return (
    <svg className="clip-preview" width={w} height={ROW_H - 18} viewBox={`0 0 ${clip.length} 1`} preserveAspectRatio="none">
      {rects.out.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={Math.max(r.w - 1, 2 / pxPerTick)} height={Math.max(0.06, 1 / rects.range)} />
      ))}
      {Array.from({ length: Math.ceil(clip.length / len) - 1 }, (_, i) => (
        <line key={`l${i}`} x1={(i + 1) * len} x2={(i + 1) * len} y1={0} y2={1} className="clip-repeat" />
      ))}
    </svg>
  );
}

function AudioPreview({ clip, pxPerTick, bpm }: { clip: AudioClip; pxPerTick: number; bpm: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const buf = engine.bank.get(clip.sampleId);
  const w = Math.max(1, Math.round(clip.length * pxPerTick));
  const h = ROW_H - 18;
  useEffect(() => {
    const c = ref.current;
    if (!c || !buf) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.min(8000, w);
    c.width = cw * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const peaks = bufferPeaks(buf);
    const spt = secondsPerTick(bpm);
    ctx.fillStyle = 'rgba(10,12,16,0.75)';
    for (let x = 0; x < cw; x++) {
      const sec = clip.offset + ((x / cw) * clip.length) * spt;
      if (sec >= buf.duration) break;
      const p = peaks[Math.min(peaks.length - 1, Math.floor((sec / buf.duration) * peaks.length))] * clip.gain;
      const ph = Math.max(1, Math.min(1, p) * (h - 2));
      ctx.fillRect(x, (h - ph) / 2, 1, ph);
    }
  }, [buf, w, h, clip.offset, clip.length, clip.gain, bpm]);
  if (!buf) return <div className="clip-missing">нет аудио</div>;
  return <canvas ref={ref} className="clip-preview" style={{ width: w, height: h }} />;
}

function AutomationPreview({ clip }: { clip: AutomationClip }) {
  const pts = clip.points.map((p) => `${p.t},${1 - p.v}`).join(' ');
  return (
    <svg className="clip-preview auto" viewBox={`0 0 ${clip.length} 1`} preserveAspectRatio="none" height={ROW_H - 18}>
      <polyline points={pts} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const ClipView = memo(function ClipView({ clip, p, pxPerTick, selected, onDown }: { clip: Clip; p: Project; pxPerTick: number; selected: boolean; onDown: (e: React.PointerEvent, clip: Clip, zone: 'body' | 'left' | 'right') => void }) {
  const trackIdx = p.tracks.findIndex((t) => t.id === clip.trackId);
  if (trackIdx < 0) return null;
  let name = '';
  let color = '#888';
  let body: React.ReactNode = null;
  let broken = false;
  if (clip.kind === 'pattern') {
    const pat = p.patterns.find((x) => x.id === clip.patternId);
    if (!pat) return null;
    name = pat.name;
    color = pat.color;
    body = <PatternPreview pattern={pat} clip={clip} timeSig={p.timeSig} pxPerTick={pxPerTick} />;
  } else if (clip.kind === 'audio') {
    name = engine.bank.name(clip.sampleId);
    color = '#4fa6e0';
    body = <AudioPreview clip={clip} pxPerTick={pxPerTick} bpm={p.bpm} />;
  } else {
    name = clip.name;
    color = '#8fc95a';
    broken = !targetExists(p, clip.target);
    body = <AutomationPreview clip={clip} />;
  }
  const w = clip.length * pxPerTick;
  return (
    <div
      className={cx('clip', `clip-${clip.kind}`, selected && 'selected', broken && 'broken')}
      style={{ left: clip.start * pxPerTick, top: trackIdx * ROW_H + 2, width: Math.max(4, w), height: ROW_H - 4, '--clip': color } as React.CSSProperties}
      onPointerDown={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const edge = e.pointerType === 'touch' ? 14 : 7;
        const x = e.clientX - r.left;
        onDown(e, clip, x > r.width - edge && r.width > edge * 2 ? 'right' : x < edge && r.width > edge * 2 && clip.kind !== 'pattern' ? 'left' : 'body');
      }}
      onContextMenu={(e) => e.preventDefault()}
      title={broken ? `${name} — цель автоматизации удалена` : name}
    >
      <div className="clip-head">{name}</div>
      {body}
    </div>
  );
});

function clipMenu(clip: Clip): { label: string; action?: () => void; danger?: boolean; separator?: boolean }[] {
  const items: { label: string; action?: () => void; danger?: boolean; separator?: boolean }[] = [];
  if (clip.kind === 'pattern') {
    items.push(
      { label: 'Открыть в Channel Rack', action: () => (patchUi({ currentPatternId: clip.patternId }), engine.setPattern(clip.patternId), setView('rack')) },
      { label: 'Открыть в Piano roll', action: () => (patchUi({ currentPatternId: clip.patternId }), engine.setPattern(clip.patternId), setView('piano')) },
      {
        label: 'Сделать уникальным',
        action: () => {
          // clonePattern selects the copy; point this clip at it.
          A.clonePattern(clip.patternId);
          const copyId = ui.get().currentPatternId;
          if (copyId && copyId !== clip.patternId) A.updateClips([{ id: clip.id, patch: { patternId: copyId } as Partial<Clip> }]);
        },
      },
    );
  } else if (clip.kind === 'automation') {
    items.push(
      { label: 'Редактировать автоматизацию', action: () => openWindow({ kind: 'automation', clipId: clip.id }) },
      {
        label: 'Переименовать…',
        action: async () => {
          const name = await askText('Имя клипа', clip.name);
          if (name) A.updateClips([{ id: clip.id, patch: { name } as Partial<Clip> }]);
        },
      },
    );
  } else {
    const gains = [0.25, 0.5, 0.7, 1, 1.4, 2];
    items.push(
      {
        label: 'Прослушать',
        action: () => {
          const b = engine.bank.get(clip.sampleId);
          if (b) engine.previewBuffer(b);
        },
      },
      ...gains.map((g) => ({ label: `${clip.gain === g ? '✓ ' : ''}Громкость ×${g}`, action: () => A.updateClips([{ id: clip.id, patch: { gain: g } as Partial<Clip> }]) })),
      {
        label: `Канал микшера: ${clip.mixerTrack === 0 ? 'Master' : clip.mixerTrack}…`,
        action: async () => {
          const v = await askText('Канал микшера (0 = Master)', String(clip.mixerTrack));
          const n = v === null ? NaN : parseInt(v, 10);
          if (Number.isFinite(n)) A.updateClips([{ id: clip.id, patch: { mixerTrack: Math.max(0, Math.min(project.get().mixer.length - 1, n)) } as Partial<Clip> }]);
        },
      },
    );
  }
  items.push(
    { separator: true, label: '' },
    { label: 'Дублировать', action: () => A.duplicateClips([clip.id]) },
    { label: 'Удалить', danger: true, action: () => A.deleteClips([clip.id]) },
  );
  return items;
}

export function Playlist() {
  const p = useProject((x) => x);
  const pl = useUi((u) => u.playlist);
  const selectedTrackId = useUi((u) => u.selectedTrackId);
  const patternId = useCurrentPatternId();
  const mode = useEngine((s) => s.mode);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const rulerHeadRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [band, setBand] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const lastPointer = useRef('mouse');

  const pxPerTick = (24 * pl.zoomX) / PPQ;
  const bar = ticksPerBar(p.timeSig);
  const beat = ticksPerBeat(p.timeSig);
  const totalTicks = Math.max(64 * bar, Math.ceil((songLengthTicks(p) + 16 * bar) / bar) * bar);
  const width = totalTicks * pxPerTick;
  const lanesH = p.tracks.length * ROW_H;
  const selection = new Set(pl.selection);
  const setPl = (patch: Partial<typeof pl>) => patchUi({ playlist: { ...ui.get().playlist, ...patch } });

  const brush = pl.brush ?? (patternId ? { kind: 'pattern' as const, id: patternId } : null);
  const brushLabel = brush?.kind === 'audio' ? engine.bank.name(brush.id) : p.patterns.find((x) => x.id === brush?.id)?.name;

  useEffect(
    () =>
      onFrame(() => {
        const s = engine.s;
        const x = (s.mode === 'song' ? engine.playheadTick() : s.startTick) * pxPerTick;
        const show = s.mode === 'song' || !s.playing;
        for (const el of [headRef.current, rulerHeadRef.current]) {
          if (!el) continue;
          el.style.transform = `translateX(${x}px)`;
          el.style.opacity = show ? '1' : '0.25';
        }
        // Follow the playhead while playing.
        const sc = scrollRef.current;
        if (sc && s.playing && s.mode === 'song' && !drag.current) {
          const vx = x - sc.scrollLeft;
          const visible = sc.clientWidth - HEAD_W;
          if (vx > visible - 40 || vx < 0) sc.scrollLeft = Math.max(0, x - 40);
        }
      }),
    [pxPerTick],
  );

  // Lane coordinates from a pointer event.
  const lanePos = (e: { clientX: number; clientY: number }) => {
    const sc = scrollRef.current!;
    const r = sc.getBoundingClientRect();
    return { x: e.clientX - r.left - HEAD_W + sc.scrollLeft, y: e.clientY - r.top - RULER_H + sc.scrollTop };
  };
  const trackAt = (y: number) => Math.max(0, Math.min(p.tracks.length - 1, Math.floor(y / ROW_H)));

  const placeBrush = (x: number, y: number): Clip | null => {
    if (!brush) return null;
    const track = p.tracks[trackAt(y)];
    const start = snapTick(x / pxPerTick, pl.snap, 'floor');
    if (brush.kind === 'pattern') {
      const pat = p.patterns.find((x2) => x2.id === brush.id);
      if (!pat) return null;
      const clip: PatternClip = { id: uid('cl'), kind: 'pattern', trackId: track.id, patternId: pat.id, start, length: patternLengthTicks(pat, p.timeSig) };
      A.addClip(clip);
      return clip;
    }
    const buf = engine.bank.get(brush.id);
    if (!buf) return null;
    const length = Math.max(1, Math.round(buf.duration / secondsPerTick(p.bpm)));
    const clip: AudioClip = { id: uid('cl'), kind: 'audio', trackId: track.id, start, length, sampleId: brush.id, offset: 0, gain: 1, mixerTrack: ui.get().selectedMixerTrack };
    A.addClip(clip);
    return clip;
  };

  const beginMove = (e: React.PointerEvent, ids: ID[], anchor: Clip) => {
    const origin = new Map<ID, { start: number; trackIdx: number }>();
    for (const c of project.get().clips) if (ids.includes(c.id)) origin.set(c.id, { start: c.start, trackIdx: p.tracks.findIndex((t) => t.id === c.trackId) });
    const pos = lanePos(e);
    drag.current = { kind: 'move', ids, origin, x0: pos.x, y0: pos.y, anchorStart: anchor.start, key: `pl-${uid()}`, moved: false };
  };

  const onClipDown = (e: React.PointerEvent, clip: Clip, zone: 'body' | 'left' | 'right') => {
    e.stopPropagation();
    lastPointer.current = e.pointerType;
    const tool: PlaylistTool = e.button === 2 ? 'erase' : pl.tool;
    if (e.button === 2 && e.pointerType === 'mouse' && !e.shiftKey) {
      // FL: right-click deletes; Shift+right-click opens the menu.
      A.deleteClips([clip.id]);
      return;
    }
    if (tool === 'erase') {
      A.deleteClips([clip.id]);
      return;
    }
    if (tool === 'slice') {
      A.sliceClip(clip.id, snapTick(lanePos(e).x / pxPerTick, pl.snap));
      return;
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    patchUi({ selectedTrackId: clip.trackId });
    if (zone !== 'body') {
      drag.current = { kind: zone === 'right' ? 'resize-r' : 'resize-l', id: clip.id, origin: clip, x0: lanePos(e).x, key: `pl-${uid()}` };
      setPl({ selection: [clip.id] });
      return;
    }
    let ids = selection.has(clip.id) ? [...selection] : [clip.id];
    if (e.shiftKey) ids = selection.has(clip.id) ? [...selection].filter((x) => x !== clip.id) : [...selection, clip.id];
    if ((e.ctrlKey || e.metaKey) && e.button === 0) {
      // Ctrl-drag duplicates.
      const src = project.get().clips.filter((c) => ids.includes(c.id));
      const copies = src.map((c) => ({ ...structuredClone(c), id: uid('cl') }));
      project.edit((d) => {
        d.clips.push(...copies);
      });
      ids = copies.map((c) => c.id);
    }
    setPl({ selection: ids });
    if (clip.kind === 'pattern') {
      patchUi({ currentPatternId: clip.patternId });
      engine.setPattern(clip.patternId);
    }
    beginMove(e, ids, clip);
  };

  const onLanesDown = (e: React.PointerEvent) => {
    lastPointer.current = e.pointerType;
    const pos = lanePos(e);
    if (pos.y < 0 || pos.y > lanesH) return;
    patchUi({ selectedTrackId: p.tracks[trackAt(pos.y)].id });
    if (e.pointerType !== 'mouse' && pl.tool === 'draw') return; // touch places on tap (onClick)
    if (e.button === 2) return;
    if (pl.tool === 'select') {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { kind: 'band', x0: pos.x, y0: pos.y, x1: pos.x, y1: pos.y };
      if (!e.shiftKey) setPl({ selection: [] });
      return;
    }
    if (pl.tool === 'draw') {
      const clip = placeBrush(pos.x, pos.y);
      if (clip) {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setPl({ selection: [clip.id] });
        beginMove(e, [clip.id], clip);
      }
    }
  };

  const onLanesClick = (e: React.MouseEvent) => {
    if (lastPointer.current === 'mouse' || pl.tool !== 'draw') return;
    const pos = lanePos(e);
    if (pos.y < 0 || pos.y > lanesH) return;
    if ((e.target as HTMLElement).closest('.clip')) return;
    const clip = placeBrush(pos.x, pos.y);
    if (clip) setPl({ selection: [clip.id] });
  };

  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const pos = lanePos(e);
    if (d.kind === 'move') {
      if (!d.moved && Math.hypot(pos.x - d.x0, pos.y - d.y0) < 3) return;
      d.moved = true;
      const snap = e.altKey ? 1 : pl.snap;
      const dt = snapTick(d.anchorStart + (pos.x - d.x0) / pxPerTick, snap) - d.anchorStart;
      const dTrack = Math.round((pos.y - d.y0) / ROW_H);
      const vals = [...d.origin.values()];
      const minStart = Math.min(...vals.map((v) => v.start));
      const minT = Math.min(...vals.map((v) => v.trackIdx));
      const maxT = Math.max(...vals.map((v) => v.trackIdx));
      const ddt = Math.max(-minStart, dt);
      const ddTrack = Math.max(-minT, Math.min(p.tracks.length - 1 - maxT, dTrack));
      A.updateClips(
        d.ids.map((id) => {
          const o = d.origin.get(id)!;
          return { id, patch: { start: o.start + ddt, trackId: p.tracks[o.trackIdx + ddTrack].id } };
        }),
        d.key,
      );
    } else if (d.kind === 'resize-r') {
      const snap = e.altKey ? 1 : pl.snap;
      const end = snapTick(d.origin.start + d.origin.length + (pos.x - d.x0) / pxPerTick, snap);
      const minLen = Math.max(1, Math.min(snap, d.origin.length));
      let length = Math.max(minLen, end - d.origin.start);
      if (d.origin.kind === 'audio') {
        const buf = engine.bank.get(d.origin.sampleId);
        if (buf) length = Math.min(length, Math.ceil((buf.duration - d.origin.offset) / secondsPerTick(p.bpm)));
      }
      const patch: Partial<Clip> = { length };
      if (d.origin.kind === 'automation') {
        // Keep the curve's shape; extend with the last value.
        const pts = d.origin.points.filter((pt) => pt.t <= length);
        const last = d.origin.points[d.origin.points.length - 1];
        if (!pts.length || pts[pts.length - 1].t < length) pts.push({ t: length, v: last?.v ?? 0.5 });
        (patch as Partial<AutomationClip>).points = pts;
      }
      A.updateClips([{ id: d.id, patch }], d.key);
    } else if (d.kind === 'resize-l') {
      const snap = e.altKey ? 1 : pl.snap;
      const o = d.origin;
      const end = o.start + o.length;
      let start = Math.min(end - Math.max(1, snap), snapTick(o.start + (pos.x - d.x0) / pxPerTick, snap));
      if (o.kind === 'audio') start = Math.max(start, o.start - Math.floor(o.offset / secondsPerTick(p.bpm)));
      start = Math.max(0, start);
      const shift = start - o.start;
      const patch: Partial<Clip> = { start, length: end - start };
      if (o.kind === 'audio') (patch as Partial<AudioClip>).offset = Math.max(0, o.offset + shift * secondsPerTick(p.bpm));
      if (o.kind === 'automation') (patch as Partial<AutomationClip>).points = o.points.map((pt) => ({ ...pt, t: pt.t - shift })).filter((pt) => pt.t >= 0);
      A.updateClips([{ id: d.id, patch }], d.key);
    } else if (d.kind === 'band') {
      d.x1 = pos.x;
      d.y1 = pos.y;
      const x = Math.min(d.x0, d.x1);
      const y = Math.min(d.y0, d.y1);
      const w = Math.abs(d.x1 - d.x0);
      const h = Math.abs(d.y1 - d.y0);
      setBand({ x, y, w, h });
      const ta = x / pxPerTick;
      const tb = (x + w) / pxPerTick;
      const ra = Math.floor(y / ROW_H);
      const rb = Math.floor((y + h) / ROW_H);
      const ids = p.clips
        .filter((c) => {
          const ti = p.tracks.findIndex((t) => t.id === c.trackId);
          return ti >= ra && ti <= rb && c.start < tb && c.start + c.length > ta;
        })
        .map((c) => c.id);
      setPl({ selection: ids });
    }
  };

  const onUp = () => {
    drag.current = null;
    setBand(null);
    project.breakCoalescing();
  };

  // Drops from the browser (patterns, samples) or audio files from the OS.
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const pos = lanePos(e);
    const track = p.tracks[trackAt(pos.y)];
    const start = snapTick(pos.x / pxPerTick, pl.snap, 'floor');
    const raw = e.dataTransfer.getData(DND_TYPE);
    if (raw) {
      const item = JSON.parse(raw) as DragItem;
      if (item.kind === 'pattern') A.placePattern(item.id, start, track.id);
      else {
        const buf = engine.bank.get(item.id);
        if (buf) A.addAudioClip(item.id, buf.duration, start, track.id, ui.get().selectedMixerTrack);
      }
      return;
    }
    if (e.dataTransfer.files.length) {
      const ids = await importAudioFiles(e.dataTransfer.files);
      let at = start;
      for (const id of ids) {
        const buf = engine.bank.get(id);
        if (!buf) continue;
        A.addAudioClip(id, buf.duration, at, track.id, ui.get().selectedMixerTrack);
        at += Math.round(buf.duration / secondsPerTick(p.bpm));
      }
    }
  };

  // Ruler: click seeks, drag sets the loop region.
  const onRulerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const x = lanePos(e).x;
    drag.current = { kind: 'ruler', x0: x, t0: snapTick(x / pxPerTick, Math.min(pl.snap, beat), 'floor'), moved: false };
  };
  const onRulerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d?.kind !== 'ruler') return;
    const x = lanePos(e).x;
    if (!d.moved && Math.abs(x - d.x0) < 6) return;
    d.moved = true;
    const t1 = snapTick(x / pxPerTick, Math.min(pl.snap, beat));
    A.setLoopRegion(Math.max(0, Math.min(d.t0, t1)), Math.max(d.t0, t1));
  };
  const onRulerUp = () => {
    const d = drag.current;
    drag.current = null;
    project.breakCoalescing();
    if (d?.kind === 'ruler' && !d.moved) {
      engine.setMode('song');
      engine.seek(d.t0);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ui.get().view !== 'playlist' && ui.get().split !== 'playlist') return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA') return;
      const sel = ui.get().playlist.selection;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length) A.deleteClips(sel);
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && sel.length) A.duplicateClips(sel);
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && ui.get().view === 'playlist') setPl({ selection: project.get().clips.map((c) => c.id) });
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const s = ui.get().playlist;
      patchUi({ playlist: { ...s, zoomX: Math.min(8, Math.max(0.1, s.zoomX * (e.deltaY < 0 ? 1.15 : 1 / 1.15))) } });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);

  const tools: { id: PlaylistTool; icon: string; label: string }[] = [
    { id: 'draw', icon: 'pencil', label: 'Рисование: ставит выбранный паттерн/сэмпл' },
    { id: 'select', icon: 'cursor', label: 'Выделение рамкой' },
    { id: 'slice', icon: 'scissors', label: 'Нарезка клипов' },
    { id: 'erase', icon: 'eraser', label: 'Ластик' },
  ];
  const barStep = bar * pxPerTick < 40 ? (bar * pxPerTick < 12 ? 8 : 4) : 1;

  return (
    <div className="playlist">
      <div className="panel-toolbar">
        <span className="panel-title">Playlist</span>
        <div className="seg">
          {tools.map((t) => (
            <button key={t.id} className={cx(pl.tool === t.id && 'on')} onClick={() => setPl({ tool: t.id })} title={t.label} aria-label={t.label}>
              <Icon name={t.icon} size={16} />
            </button>
          ))}
        </div>
        <label className="inline-field" title="Привязка">
          <Icon name="magnet" size={14} />
          <select value={pl.snap} onChange={(e) => setPl({ snap: Number(e.target.value) })}>
            {PL_SNAPS.map((s) => (
              <option key={s.ticks} value={s.ticks}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button className="icon-btn" onClick={() => setPl({ zoomX: Math.max(0.1, pl.zoomX / 1.3) })} title="Уменьшить" aria-label="Уменьшить">
          <Icon name="zoomOut" size={16} />
        </button>
        <button className="icon-btn" onClick={() => setPl({ zoomX: Math.min(8, pl.zoomX * 1.3) })} title="Увеличить" aria-label="Увеличить">
          <Icon name="zoomIn" size={16} />
        </button>
        <span className="brush" title="Что ставит инструмент рисования">
          <Icon name={brush?.kind === 'audio' ? 'wave' : 'music'} size={14} /> {brushLabel ?? '—'}
          {pl.brush && (
            <button className="link" onClick={() => setPl({ brush: null })}>
              сброс
            </button>
          )}
        </span>
        <div className="spacer" />
        {p.loop && (
          <button className="btn" onClick={() => A.setLoopRegion(0, 0)} title="Убрать регион цикла">
            <Icon name="loop" size={14} /> Сбросить цикл
          </button>
        )}
        {pl.selection.length > 0 && (
          <>
            <button className="icon-btn" onClick={() => A.duplicateClips(pl.selection)} title="Дублировать (Ctrl+B)" aria-label="Дублировать">
              <Icon name="copy" size={16} />
            </button>
            <button className="icon-btn" onClick={() => A.deleteClips(pl.selection)} title="Удалить (Del)" aria-label="Удалить">
              <Icon name="trash" size={16} />
            </button>
          </>
        )}
      </div>
      <div className="pl-scroll" ref={scrollRef}>
        <div className="pl-grid" style={{ gridTemplateColumns: `${HEAD_W}px ${width}px`, gridTemplateRows: `${RULER_H}px ${lanesH + 40}px` }}>
          <div className="pl-corner">
            <span className={cx('mode-chip', mode === 'song' && 'on')}>{mode === 'song' ? 'SONG' : 'PAT'}</span>
          </div>
          <div
            className="pl-ruler"
            onPointerDown={onRulerDown}
            onPointerMove={onRulerMove}
            onPointerUp={onRulerUp}
            onContextMenu={(e) => {
              e.preventDefault();
              openMenu(e.clientX, e.clientY, [
                { label: 'Убрать регион цикла', action: () => A.setLoopRegion(0, 0), disabled: !p.loop },
                { label: 'Перейти в начало', action: () => engine.seek(0) },
              ]);
            }}
            title="Клик — перейти, протянуть — регион цикла"
          >
            {p.loop && <div className="pl-loop" style={{ left: p.loop.start * pxPerTick, width: (p.loop.end - p.loop.start) * pxPerTick }} />}
            {Array.from({ length: Math.ceil(totalTicks / bar / barStep) }, (_, i) => (
              <span key={i} className="pl-bar" style={{ left: i * barStep * bar * pxPerTick }}>
                {i * barStep + 1}
              </span>
            ))}
            <div className="pl-head-marker" ref={rulerHeadRef} />
          </div>
          <div className="pl-heads">
            {p.tracks.map((t) => (
              <div
                key={t.id}
                className={cx('pl-track-head', t.mute && 'muted', t.id === selectedTrackId && 'selected')}
                style={{ height: ROW_H, '--trk': t.color } as React.CSSProperties}
                onClick={() => patchUi({ selectedTrackId: t.id })}
              >
                <button className={cx('led', !t.mute && 'on')} onClick={() => A.updateTrack(t.id, { mute: !t.mute })} aria-label="Мьют дорожки" aria-pressed={t.mute} />
                <span
                  className="trk-name"
                  onDoubleClick={async () => {
                    const name = await askText('Имя дорожки', t.name);
                    if (name) A.updateTrack(t.id, { name });
                  }}
                  title="Двойной клик — переименовать"
                >
                  {t.name}
                </span>
              </div>
            ))}
            <button className="pl-add-track" onClick={() => A.addTrack()} style={{ height: 32 }}>
              <Icon name="plus" size={14} /> Дорожка
            </button>
          </div>
          <div
            className={cx('pl-lanes', `tool-${pl.tool}`)}
            style={{
              height: lanesH,
              '--bar': `${bar * pxPerTick}px`,
              '--beat': `${beat * pxPerTick}px`,
              '--row': `${ROW_H}px`,
            } as React.CSSProperties}
            onPointerDown={onLanesDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onClick={onLanesClick}
            onContextMenu={(e) => e.preventDefault()}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(DND_TYPE) || e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }
            }}
            onDrop={(e) => void onDrop(e)}
          >
            {p.loop && <div className="pl-loop-lane" style={{ left: p.loop.start * pxPerTick, width: (p.loop.end - p.loop.start) * pxPerTick }} />}
            {p.clips.map((c) => (
              <div
                key={c.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  // Mouse right-click deletes (FL); Shift+right-click or a long press opens the menu.
                  if (lastPointer.current === 'mouse' && !e.shiftKey) return;
                  openMenu(e.clientX, e.clientY, clipMenu(c));
                }}
                onDoubleClick={() => {
                  if (c.kind === 'automation') openWindow({ kind: 'automation', clipId: c.id });
                  else if (c.kind === 'pattern') setView('piano');
                }}
              >
                <ClipView clip={c} p={p} pxPerTick={pxPerTick} selected={selection.has(c.id)} onDown={onClipDown} />
              </div>
            ))}
            {band && <div className="band" style={{ left: band.x, top: band.y, width: band.w, height: band.h }} />}
            <div className="pl-playhead" ref={headRef} />
          </div>
        </div>
      </div>
      {pl.selection.length === 1 && <ClipActions id={pl.selection[0]} />}
    </div>
  );
}

/** Touch-friendly action strip for the selected clip. */
function ClipActions({ id }: { id: ID }) {
  const clip = useProject((p) => p.clips.find((c) => c.id === id));
  if (!clip) return null;
  return (
    <div className="clip-actions">
      <button className="btn" onClick={(e) => openMenu(e.clientX, e.clientY, clipMenu(clip))}>
        <Icon name="dots" size={14} /> Действия с клипом
      </button>
    </div>
  );
}
