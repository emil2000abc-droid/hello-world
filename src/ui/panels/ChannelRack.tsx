import { memo, useEffect, useRef } from 'react';
import { patternLengthTicks, stepsPerBar } from '../../core/music';
import { CHANNEL_PAN_SPEC, CHANNEL_VOLUME_SPEC, DRUM_KINDS, formatParam } from '../../core/params';
import { TICKS_PER_STEP, type Channel, type Note, type Pattern } from '../../core/types';
import { makeDrumChannel, makeSamplerChannel, makeSynthChannel, SYNTH_PRESETS } from '../../project/factory';
import * as A from '../../state/actions';
import { askText, engine, openMenu, openWindow, patchUi, project, setView, useCurrentPatternId, useProject, useSelectedChannelId, type MenuItem } from '../../state/app';
import { Icon } from '../components/Icon';
import { Knob } from '../components/Knob';
import { onFrame } from '../frame';
import { cx } from '../util';

export function addChannelMenuItems(): MenuItem[] {
  const n = () => project.get().channels.length;
  const samples = engine.bank.list();
  return [
    ...Object.keys(SYNTH_PRESETS).map((name) => ({ label: `Синтезатор — ${name}`, action: () => A.addChannel(makeSynthChannel(name, n())) })),
    { separator: true, label: '' },
    ...DRUM_KINDS.map((k) => ({ label: `Драм — ${k.label}`, action: () => A.addChannel(makeDrumChannel(k.value, n())) })),
    { separator: true, label: '' },
    ...samples.slice(0, 14).map((s) => ({ label: `Сэмплер — ${s.name}`, action: () => A.addChannel(makeSamplerChannel(s.id, s.name, n())) })),
  ];
}

function onStepGrid(notes: Note[] | undefined, stepPitch: number): boolean {
  if (!notes) return true;
  return notes.every((n) => n.start % TICKS_PER_STEP === 0 && n.length === TICKS_PER_STEP && n.pitch === stepPitch);
}

/** Painting state shared across rows while the pointer is down. */
const paint = { active: false, on: true, channelId: '', pointer: 'mouse' };

const Steps = memo(function Steps({ channel, pattern, steps, perBar }: { channel: Channel; pattern: Pattern; steps: number; perBar: number }) {
  const notes = pattern.notes[channel.id];
  const byStep = new Map<number, Note>();
  for (const n of notes ?? []) if (n.start % TICKS_PER_STEP === 0) byStep.set(n.start / TICKS_PER_STEP, n);
  const beat = perBar >= 12 && perBar % 4 === 0 ? 4 : perBar % 3 === 0 ? 3 : 4;

  const apply = (step: number) => {
    A.toggleStep(pattern.id, channel.id, step, paint.on);
    if (paint.on) engine.noteOn(channel.id, channel.stepPitch, 0.8);
    setTimeout(() => engine.noteOff(channel.id, channel.stepPitch), 120);
  };

  return (
    <div
      className="steps"
      onPointerUp={() => (paint.active = false)}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse' && e.buttons === 0) paint.active = false;
      }}
    >
      {Array.from({ length: steps }, (_, s) => {
        const note = byStep.get(s);
        const group = Math.floor(s / beat) % 2;
        return (
          <button
            key={s}
            className={cx('step', note && 'on', group ? 'alt' : '', s % perBar === 0 && 'bar')}
            style={note ? { '--vel': note.velocity, '--ch': channel.color } as React.CSSProperties : undefined}
            aria-label={`Шаг ${s + 1}`}
            aria-pressed={!!note}
            onPointerDown={(e) => {
              paint.pointer = e.pointerType;
              // Touch: toggle on tap (onClick) so swipes can still scroll the rack.
              if (e.pointerType !== 'mouse') return;
              e.preventDefault();
              paint.active = true;
              paint.channelId = channel.id;
              paint.on = e.button === 2 ? false : !note;
              apply(s);
            }}
            onClick={() => {
              if (paint.pointer === 'mouse') return;
              paint.on = !note;
              apply(s);
            }}
            onPointerEnter={() => {
              if (paint.active && paint.channelId === channel.id && !!note !== paint.on) apply(s);
            }}
            onContextMenu={(e) => e.preventDefault()}
            onWheel={(e) => {
              if (!note) return;
              A.setStepVelocity(pattern.id, channel.id, s, note.velocity + (e.deltaY < 0 ? 0.05 : -0.05));
            }}
            title={note ? `Velocity ${Math.round(note.velocity * 100)}% (колесо — изменить)` : undefined}
          />
        );
      })}
    </div>
  );
});

function MiniRoll({ channel, pattern, length }: { channel: Channel; pattern: Pattern; length: number }) {
  const notes = pattern.notes[channel.id] ?? [];
  const lo = Math.min(...notes.map((n) => n.pitch));
  const hi = Math.max(...notes.map((n) => n.pitch));
  const range = Math.max(12, hi - lo + 1);
  return (
    <button
      className="mini-roll"
      onClick={() => {
        patchUi({ selectedChannelId: channel.id });
        engine.setLiveChannel(channel.id);
        setView('piano');
      }}
      title="Открыть в Piano roll"
    >
      <svg viewBox={`0 0 ${length} ${range}`} preserveAspectRatio="none">
        {notes.map((n) => (
          <rect key={n.id} x={n.start} y={hi - n.pitch + (range - (hi - lo + 1)) / 2} width={Math.max(4, n.length - 2)} height={0.9} fill={channel.color} />
        ))}
      </svg>
    </button>
  );
}

function channelMenu(ch: Channel, patternId: string): MenuItem[] {
  return [
    { label: 'Открыть инструмент', action: () => openWindow({ kind: 'channel', channelId: ch.id }) },
    {
      label: 'Piano roll',
      action: () => {
        patchUi({ selectedChannelId: ch.id });
        setView('piano');
      },
    },
    {
      label: 'Переименовать…',
      action: async () => {
        const name = await askText('Имя канала', ch.name);
        if (name) A.updateChannel(ch.id, { name });
      },
    },
    { label: 'Клонировать', action: () => A.cloneChannel(ch.id) },
    { label: 'Переместить вверх', action: () => A.moveChannel(ch.id, -1) },
    { label: 'Переместить вниз', action: () => A.moveChannel(ch.id, 1) },
    { separator: true, label: '' },
    { label: 'Заполнить каждый 2-й шаг', action: () => A.fillSteps(patternId, ch.id, 2) },
    { label: 'Заполнить каждый 4-й шаг', action: () => A.fillSteps(patternId, ch.id, 4) },
    { label: 'Заполнить каждый 8-й шаг', action: () => A.fillSteps(patternId, ch.id, 8) },
    { label: 'Очистить в паттерне', action: () => A.clearChannelNotes(patternId, ch.id) },
    { separator: true, label: '' },
    { label: 'Создать автоматизацию громкости', action: () => A.createAutomationClip({ scope: 'channel', channelId: ch.id, param: 'volume' }) },
    { separator: true, label: '' },
    { label: 'Удалить канал', danger: true, action: () => A.removeChannel(ch.id) },
  ];
}

const Row = memo(function Row({ ch, pattern, steps, perBar, selected, mixerCount, mixerNames }: { ch: Channel; pattern: Pattern; steps: number; perBar: number; selected: boolean; mixerCount: number; mixerNames: string[] }) {
  const grid = onStepGrid(pattern.notes[ch.id], ch.stepPitch);
  const select = () => {
    patchUi({ selectedChannelId: ch.id });
    engine.setLiveChannel(ch.id);
  };
  return (
    <div className={cx('rack-row', selected && 'selected', ch.mute && 'muted')} onPointerDown={select}>
      <button className={cx('led', !ch.mute && 'on')} onClick={() => A.updateChannel(ch.id, { mute: !ch.mute })} title={ch.mute ? 'Включить канал' : 'Заглушить канал'} aria-label="Мьют" aria-pressed={ch.mute} />
      <Knob spec={CHANNEL_PAN_SPEC} value={ch.pan} onChange={(v, c) => A.updateChannel(ch.id, { pan: v }, c)} automation={{ scope: 'channel', channelId: ch.id, param: 'pan' }} bipolar compact size={24} format={(v) => (Math.abs(v) < 0.01 ? 'C' : `${Math.round(Math.abs(v) * 100)}${v < 0 ? 'L' : 'R'}`)} label="Pan" />
      <Knob spec={CHANNEL_VOLUME_SPEC} value={ch.volume} onChange={(v, c) => A.updateChannel(ch.id, { volume: v }, c)} automation={{ scope: 'channel', channelId: ch.id, param: 'volume' }} compact size={24} color={ch.color} format={(v) => formatParam({ ...CHANNEL_VOLUME_SPEC, unit: '%' }, v)} label="Volume" />
      <select className="route" value={ch.mixerTrack} onChange={(e) => A.updateChannel(ch.id, { mixerTrack: Number(e.target.value) })} title={`Канал микшера: ${ch.mixerTrack === 0 ? 'Master' : `${ch.mixerTrack} · ${mixerNames[ch.mixerTrack]}`}`} aria-label="Канал микшера">
        {Array.from({ length: mixerCount }, (_, i) => (
          <option key={i} value={i}>
            {i === 0 ? 'M — Master' : `${i} — ${mixerNames[i]}`}
          </option>
        ))}
      </select>
      <button
        className="ch-name"
        style={{ '--ch': ch.color } as React.CSSProperties}
        onClick={() => openWindow({ kind: 'channel', channelId: ch.id })}
        onContextMenu={(e) => {
          e.preventDefault();
          openMenu(e.clientX, e.clientY, channelMenu(ch, pattern.id));
        }}
        title="Клик — инструмент, правый клик — меню"
      >
        <Icon name={ch.type === 'drum' ? 'drum' : ch.type === 'synth' ? 'synth' : 'sample'} size={14} />
        <span>{ch.name}</span>
      </button>
      <button className="icon-btn row-menu" onClick={(e) => openMenu(e.clientX, e.clientY, channelMenu(ch, pattern.id))} aria-label="Меню канала">
        <Icon name="dots" size={14} />
      </button>
      {grid ? <Steps channel={ch} pattern={pattern} steps={steps} perBar={perBar} /> : <MiniRoll channel={ch} pattern={pattern} length={steps * TICKS_PER_STEP} />}
    </div>
  );
});

export function ChannelRack() {
  const channels = useProject((p) => p.channels);
  const patterns = useProject((p) => p.patterns);
  const timeSig = useProject((p) => p.timeSig);
  const swing = useProject((p) => p.swing);
  const mixer = useProject((p) => p.mixer);
  const patternId = useCurrentPatternId();
  const selected = useSelectedChannelId();
  const pattern = patterns.find((p) => p.id === patternId);
  const headRef = useRef<HTMLDivElement>(null);
  const len = pattern ? patternLengthTicks(pattern, timeSig) : 0;
  const steps = len / TICKS_PER_STEP;
  const perBar = stepsPerBar(timeSig);
  const mixerNames = mixer.map((m) => m.name);

  useEffect(() => {
    const up = () => (paint.active = false);
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  }, []);

  useEffect(
    () =>
      onFrame(() => {
        const el = headRef.current;
        if (!el) return;
        const s = engine.s;
        if (!s.playing || !len) {
          el.style.opacity = '0';
          return;
        }
        let tick = engine.playheadTick();
        if (s.mode === 'song') {
          const clip = project.get().clips.find((c) => c.kind === 'pattern' && c.patternId === patternId && tick >= c.start && tick < c.start + c.length);
          if (!clip) {
            el.style.opacity = '0';
            return;
          }
          tick -= clip.start;
        }
        const step = Math.floor((tick % len) / TICKS_PER_STEP);
        el.style.opacity = '1';
        el.style.setProperty('--step', String(step));
      }),
    [len, patternId],
  );

  if (!pattern) return <div className="empty">Нет паттернов</div>;

  return (
    <div className="rack" onContextMenu={(e) => e.target === e.currentTarget && e.preventDefault()}>
      <div className="panel-toolbar">
        <span className="panel-title">Channel Rack · {pattern.name}</span>
        <label className="inline-field" title="Длина паттерна в тактах">
          Такты
          <select value={pattern.bars} onChange={(e) => A.setPatternBars(pattern.id, Number(e.target.value))}>
            {[1, 2, 3, 4, 6, 8, 12, 16].map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <Knob spec={{ kind: 'number', key: 'swing', label: 'Swing', min: 0, max: 1, default: 0, unit: '%' }} value={swing} onChange={(v) => A.setSwing(v)} compact size={26} />
        <span className="dim">Swing</span>
        <div className="spacer" />
        <button className="btn" onClick={(e) => openMenu(e.clientX, e.clientY, addChannelMenuItems())}>
          <Icon name="plus" size={14} /> Канал
        </button>
      </div>
      <div className="rack-body">
        <div className="rack-rows" style={{ '--steps': steps } as React.CSSProperties}>
          {channels.map((ch) => (
            <Row key={ch.id} ch={ch} pattern={pattern} steps={steps} perBar={perBar} selected={ch.id === selected} mixerCount={mixer.length} mixerNames={mixerNames} />
          ))}
          <div className="rack-playhead" ref={headRef} />
          {channels.length === 0 && <div className="empty">Добавьте инструмент кнопкой «Канал» или из браузера</div>}
        </div>
      </div>
    </div>
  );
}
