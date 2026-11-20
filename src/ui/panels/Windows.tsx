import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { targetLabel, targetSpec } from '../../core/automation';
import { formatParam, fromNormalized, instrumentSpecs, CHANNEL_PAN_SPEC, CHANNEL_VOLUME_SPEC, EFFECT_DEFS } from '../../core/params';
import { isBlackKey, noteName, snapTick, ticksPerBar, ticksPerBeat } from '../../core/music';
import { TICKS_PER_STEP, type AutomationPoint, type Channel } from '../../core/types';
import { bufferPeaks } from '../../audio/wav';
import { SYNTH_PRESETS } from '../../project/factory';
import * as A from '../../state/actions';
import { askText, closeWindow, engine, openWindow, project, useProject, useUi, type WindowRef } from '../../state/app';
import { importAudioFiles } from '../../state/persistence';
import { Icon } from '../components/Icon';
import { Knob } from '../components/Knob';
import { ParamPanel } from '../components/ParamPanel';
import { cx, pickFiles } from '../util';

let cascade = 0;

/** Close a window whose subject was deleted (after render, not during it). */
function useCloseIfMissing(missing: boolean, w: WindowRef): void {
  useEffect(() => {
    if (missing) closeWindow(w);
  }, [missing, w]);
}

function FloatingWindow({ refKey, title, color, onClose, children, width = 520 }: { refKey: WindowRef; title: React.ReactNode; color?: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  const [pos, setPos] = useState(() => {
    const i = cascade++ % 6;
    return { x: Math.max(8, Math.min(window.innerWidth - width - 8, 120 + i * 28)), y: 90 + i * 28 };
  });
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  return (
    <div className="window" style={{ left: pos.x, top: pos.y, width, '--win': color } as React.CSSProperties} onPointerDown={() => openWindow(refKey)} role="dialog" aria-label={typeof title === 'string' ? title : undefined}>
      <div
        className="window-title"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPos({
            x: Math.max(-width + 80, Math.min(window.innerWidth - 80, e.clientX - drag.current.dx)),
            y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.current.dy)),
          });
        }}
        onPointerUp={() => (drag.current = null)}
      >
        <span className="window-title-text">{title}</span>
        <button className="icon-btn" onClick={onClose} aria-label="Закрыть">
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="window-body">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- keyboard

function MiniKeyboard({ channel }: { channel: Channel }) {
  const [octave, setOctave] = useState(5);
  const held = useRef(new Map<number, number>());
  const keys = Array.from({ length: 25 }, (_, i) => octave * 12 + i);
  const whites = keys.filter((k) => !isBlackKey(k));
  const down = (pitch: number, e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    held.current.set(e.pointerId, pitch);
    engine.noteOn(channel.id, pitch, 0.85);
  };
  const up = (e: React.PointerEvent) => {
    const p = held.current.get(e.pointerId);
    if (p === undefined) return;
    held.current.delete(e.pointerId);
    engine.noteOff(channel.id, p);
  };
  const enter = (pitch: number, e: React.PointerEvent) => {
    if (!held.current.has(e.pointerId) || held.current.get(e.pointerId) === pitch) return;
    engine.noteOff(channel.id, held.current.get(e.pointerId)!);
    held.current.set(e.pointerId, pitch);
    engine.noteOn(channel.id, pitch, 0.85);
  };
  return (
    <div className="mini-kb">
      <div className="mini-kb-oct">
        <button className="icon-btn" onClick={() => setOctave(Math.max(1, octave - 1))} aria-label="Октава ниже">
          <Icon name="chevronLeft" size={14} />
        </button>
        <span>{noteName(octave * 12)}</span>
        <button className="icon-btn" onClick={() => setOctave(Math.min(8, octave + 1))} aria-label="Октава выше">
          <Icon name="chevronRight" size={14} />
        </button>
      </div>
      <div className="mini-kb-keys" onPointerUp={up} onPointerCancel={up} onPointerLeave={up}>
        {whites.map((k) => (
          <div key={k} className="kb-white" onPointerDown={(e) => down(k, e)} onPointerEnter={(e) => enter(k, e)}>
            {k % 12 === 0 && <span>{noteName(k)}</span>}
          </div>
        ))}
        {keys
          .filter((k) => isBlackKey(k))
          .map((k) => {
            const whiteIdx = whites.filter((w) => w < k).length;
            return <div key={k} className="kb-black" style={{ left: `calc(${(whiteIdx / whites.length) * 100}% - ${100 / whites.length / 3}%)`, width: `${(100 / whites.length) * 0.62}%` }} onPointerDown={(e) => down(k, e)} onPointerEnter={(e) => enter(k, e)} />;
          })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- sampler view

let bankVer = 0;
engine.bank.subscribe(() => bankVer++);

function SampleView({ channel }: { channel: Channel }) {
  useSyncExternalStore(
    (l) => engine.bank.subscribe(l),
    () => bankVer,
  );
  const sampleId = typeof channel.params.sampleId === 'string' ? channel.params.sampleId : '';
  const buf = engine.bank.get(sampleId);
  const ref = useRef<HTMLCanvasElement>(null);
  const start = typeof channel.params.start === 'number' ? channel.params.start : 0;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const w = c.clientWidth || 460;
    const h = 70;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = h * dpr;
    const ctx = c.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#16181c';
    ctx.fillRect(0, 0, w, h);
    if (!buf) return;
    const peaks = bufferPeaks(buf);
    ctx.fillStyle = channel.color;
    for (let x = 0; x < w; x++) {
      const p = peaks[Math.floor((x / w) * peaks.length)];
      const ph = Math.max(1, p * (h - 4));
      ctx.fillRect(x, (h - ph) / 2, 1, ph);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, start * w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(start * w, 0, 1, h);
  }, [buf, start, channel.color]);
  return (
    <div className="sample-view">
      <div className="sample-row">
        <select value={sampleId} onChange={(e) => A.setChannelParam(channel.id, 'sampleId', e.target.value)} aria-label="Сэмпл">
          {!buf && <option value="">— выберите сэмпл —</option>}
          {engine.bank.list().map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button
          className="btn"
          onClick={async () => {
            const [id] = await importAudioFiles(await pickFiles('audio/*,.wav,.mp3,.ogg,.flac,.m4a'));
            if (id) A.setChannelParam(channel.id, 'sampleId', id);
          }}
        >
          <Icon name="upload" size={14} /> Загрузить
        </button>
        {buf && (
          <button className="btn" onClick={() => engine.previewBuffer(buf)}>
            <Icon name="play" size={12} /> {buf.duration.toFixed(2)}s
          </button>
        )}
      </div>
      <canvas ref={ref} className="sample-wave" />
    </div>
  );
}

// ---------------------------------------------------------------- channel window

function ChannelWindow({ w, channelId }: { w: WindowRef; channelId: string }) {
  const ch = useProject((p) => p.channels.find((c) => c.id === channelId));
  const mixer = useProject((p) => p.mixer);
  useCloseIfMissing(!ch, w);
  if (!ch) return null;
  const specs = instrumentSpecs(ch.type);
  const hide = ch.type === 'sampler' ? ['sampleId'] : [];
  return (
    <FloatingWindow
      refKey={w}
      color={ch.color}
      width={560}
      onClose={() => closeWindow(w)}
      title={
        <>
          <span className="swatch" style={{ background: ch.color }} />
          <button
            className="title-btn"
            onClick={async () => {
              const name = await askText('Имя канала', ch.name);
              if (name) A.updateChannel(ch.id, { name });
            }}
          >
            {ch.name}
          </button>
          <span className="dim">{ch.type === 'synth' ? 'Синтезатор' : ch.type === 'drum' ? 'Драм-синт' : 'Сэмплер'}</span>
        </>
      }
    >
      <div className="ch-settings">
        <Knob spec={CHANNEL_VOLUME_SPEC} value={ch.volume} onChange={(v, c) => A.updateChannel(ch.id, { volume: v }, c)} automation={{ scope: 'channel', channelId: ch.id, param: 'volume' }} color={ch.color} format={(v) => formatParam({ ...CHANNEL_VOLUME_SPEC, unit: '%' }, v)} label="Громк." />
        <Knob spec={CHANNEL_PAN_SPEC} value={ch.pan} onChange={(v, c) => A.updateChannel(ch.id, { pan: v }, c)} automation={{ scope: 'channel', channelId: ch.id, param: 'pan' }} bipolar label="Панорама" format={(v) => (Math.abs(v) < 0.01 ? 'C' : `${Math.round(Math.abs(v) * 100)}${v < 0 ? 'L' : 'R'}`)} />
        <label className="field">
          <span>Микшер</span>
          <select value={ch.mixerTrack} onChange={(e) => A.updateChannel(ch.id, { mixerTrack: Number(e.target.value) })}>
            {mixer.map((m, i) => (
              <option key={m.id} value={i}>
                {i === 0 ? 'Master' : `${i} · ${m.name}`}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Нота шага</span>
          <select value={ch.stepPitch} onChange={(e) => A.updateChannel(ch.id, { stepPitch: Number(e.target.value) })}>
            {Array.from({ length: 61 }, (_, i) => 24 + i).map((p) => (
              <option key={p} value={p}>
                {noteName(p)}
              </option>
            ))}
          </select>
        </label>
        {ch.type === 'synth' && (
          <label className="field">
            <span>Пресет</span>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) A.setChannelParams(ch.id, { ...SYNTH_PRESETS[e.target.value] });
              }}
            >
              <option value="">Загрузить…</option>
              {Object.keys(SYNTH_PRESETS).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {ch.type === 'sampler' && <SampleView channel={ch} />}
      <ParamPanel
        specs={specs}
        values={ch.params}
        hide={hide}
        color={ch.color}
        onChange={(k, v, c) => A.setChannelParam(ch.id, k, v, c ?? `p-${ch.id}-${k}`)}
        automation={(key) => ({ scope: 'channel', channelId: ch.id, param: key })}
      />
      <MiniKeyboard channel={ch} />
    </FloatingWindow>
  );
}

// ---------------------------------------------------------------- effect window

function EffectWindow({ w, trackIndex, effectId }: { w: WindowRef; trackIndex: number; effectId: string }) {
  const slot = useProject((p) => p.mixer[trackIndex]?.effects.find((e) => e.id === effectId));
  const trackName = useProject((p) => (trackIndex === 0 ? 'Master' : p.mixer[trackIndex]?.name));
  useCloseIfMissing(!slot, w);
  if (!slot) return null;
  const def = EFFECT_DEFS[slot.type];
  return (
    <FloatingWindow
      refKey={w}
      width={440}
      onClose={() => closeWindow(w)}
      title={
        <>
          <Icon name="fx" size={14} /> {def.name} <span className="dim">· {trackName}</span>
        </>
      }
    >
      <div className="fx-window-bar">
        <button className={cx('toggle', !slot.bypass && 'on')} onClick={() => A.setEffectBypass(trackIndex, slot.id, !slot.bypass)}>
          <Icon name="power" size={12} /> {slot.bypass ? 'Выключен' : 'Включён'}
        </button>
        <span className="dim">Правый клик по ручке — клип автоматизации</span>
      </div>
      <ParamPanel
        specs={def.params}
        values={slot.params}
        onChange={(k, v, c) => A.setEffectParam(trackIndex, slot.id, k, v, c ?? `fx-${slot.id}-${k}`)}
        automation={(key) => {
          const spec = def.params.find((s) => s.key === key);
          return spec?.kind === 'number' && spec.automatable ? { scope: 'effect', trackIndex, effectId: slot.id, param: key } : undefined;
        }}
      />
    </FloatingWindow>
  );
}

// ---------------------------------------------------------------- automation window

const SHAPES: Record<string, (n: number) => AutomationPoint[]> = {
  'Подъём': () => [
    { t: 0, v: 0 },
    { t: 1, v: 1 },
  ],
  'Спад': () => [
    { t: 0, v: 1 },
    { t: 1, v: 0 },
  ],
  'Синус': (n) => Array.from({ length: n * 8 + 1 }, (_, i) => ({ t: i / (n * 8), v: 0.5 + 0.5 * Math.sin((i / 8) * Math.PI * 2) })),
  'Треугольник': (n) => Array.from({ length: n * 2 + 1 }, (_, i) => ({ t: i / (n * 2), v: i % 2 ? 1 : 0 })),
  'Пила': (n) => Array.from({ length: n }, (_, i) => [
    { t: i / n, v: 0 },
    { t: (i + 1) / n - 0.0001, v: 1 },
  ]).flat(),
};

function AutomationWindow({ w, clipId }: { w: WindowRef; clipId: string }) {
  const clip = useProject((p) => p.clips.find((c) => c.id === clipId));
  const timeSig = useProject((p) => p.timeSig);
  const ref = useRef<SVGSVGElement>(null);
  const drag = useRef<{ index: number; key: string } | null>(null);
  const [hover, setHover] = useState<string>('');
  const [snap, setSnap] = useState(true);
  useCloseIfMissing(!clip || clip.kind !== 'automation', w);
  if (!clip || clip.kind !== 'automation') return null;
  const p = project.get();
  const spec = targetSpec(p, clip.target);
  const W = 600;
  const H = 200;
  const len = clip.length;
  const pts = clip.points;
  const fmt = (v: number) => (spec ? formatParam(spec, fromNormalized(spec, v)) : `${Math.round(v * 100)}%`);
  const toPoint = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    let t = Math.max(0, Math.min(len, ((e.clientX - r.left) / r.width) * len));
    if (snap) t = snapTick(t, TICKS_PER_STEP);
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
    return { t, v };
  };
  const setPts = (next: AutomationPoint[], key?: string) => A.setAutomationPoints(clip.id, [...next].sort((a, b) => a.t - b.t), key);
  const bar = ticksPerBar(timeSig);
  const beat = ticksPerBeat(timeSig);

  return (
    <FloatingWindow refKey={w} width={660} onClose={() => closeWindow(w)} title={<><Icon name="automation" size={14} /> {targetLabel(p, clip.target)}</>}>
      <div className="auto-toolbar">
        {Object.entries(SHAPES).map(([name, fn]) => (
          <button key={name} className="btn" onClick={() => setPts(fn(Math.max(1, Math.round(len / bar))).map((q) => ({ t: q.t * len, v: q.v })))}>
            {name}
          </button>
        ))}
        <button className={cx('toggle', snap && 'on')} onClick={() => setSnap(!snap)}>
          <Icon name="magnet" size={12} /> Сетка
        </button>
        <span className="dim auto-hover">{hover}</span>
      </div>
      <svg
        ref={ref}
        className="auto-editor"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onPointerDown={(e) => {
          if (e.button === 2) return;
          const q = toPoint(e);
          const next = [...pts, q].sort((a, b) => a.t - b.t);
          const key = `auto-${Date.now()}`;
          setPts(next, key);
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
          drag.current = { index: next.indexOf(q), key };
        }}
        onPointerMove={(e) => {
          const q = toPoint(e);
          setHover(`${Math.floor(q.t / bar) + 1}.${Math.floor((q.t % bar) / beat) + 1} · ${fmt(q.v)}`);
          const d = drag.current;
          if (!d) return;
          const sorted = [...pts];
          const prev = sorted[d.index - 1];
          const nxt = sorted[d.index + 1];
          const t = Math.max(prev ? prev.t : 0, Math.min(nxt ? nxt.t : len, q.t));
          sorted[d.index] = { t, v: q.v };
          A.setAutomationPoints(clip.id, sorted, d.key);
        }}
        onPointerUp={() => {
          drag.current = null;
          project.breakCoalescing();
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {Array.from({ length: Math.floor(len / beat) + 1 }, (_, i) => (
          <line key={i} x1={(i * beat * W) / len} x2={(i * beat * W) / len} y1={0} y2={H} className={(i * beat) % bar === 0 ? 'grid-bar' : 'grid-beat'} />
        ))}
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} className="grid-beat" />
        <polygon points={`0,${H} ${pts.map((q) => `${(q.t / len) * W},${(1 - q.v) * H}`).join(' ')} ${W},${(1 - (pts[pts.length - 1]?.v ?? 0)) * H} ${W},${H}`} className="auto-fill" />
        <polyline points={pts.map((q) => `${(q.t / len) * W},${(1 - q.v) * H}`).join(' ')} className="auto-line" vectorEffect="non-scaling-stroke" />
        {pts.map((q, i) => (
          <circle
            key={i}
            cx={(q.t / len) * W}
            cy={(1 - q.v) * H}
            r={6}
            className="auto-point"
            vectorEffect="non-scaling-stroke"
            onPointerDown={(e) => {
              e.stopPropagation();
              if (e.button === 2 || e.altKey) {
                if (pts.length > 1) setPts(pts.filter((_, j) => j !== i));
                return;
              }
              (ref.current as Element).setPointerCapture(e.pointerId);
              drag.current = { index: i, key: `auto-${Date.now()}` };
            }}
            onDoubleClick={() => pts.length > 1 && setPts(pts.filter((_, j) => j !== i))}
          />
        ))}
      </svg>
      <div className="dim auto-help">Клик — добавить точку · тянуть — двигать · двойной/правый клик — удалить</div>
    </FloatingWindow>
  );
}

export function Windows() {
  const windows = useUi((u) => u.windows);
  return (
    <>
      {windows.map((w) => {
        const key = JSON.stringify(w);
        if (w.kind === 'channel') return <ChannelWindow key={key} w={w} channelId={w.channelId} />;
        if (w.kind === 'effect') return <EffectWindow key={key} w={w} trackIndex={w.trackIndex} effectId={w.effectId} />;
        return <AutomationWindow key={key} w={w} clipId={w.clipId} />;
      })}
    </>
  );
}
