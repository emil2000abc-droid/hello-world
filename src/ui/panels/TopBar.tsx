import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { formatPosition, formatTime, ticksPerBar } from '../../core/music';
import { CHANNEL_VOLUME_SPEC } from '../../core/params';
import * as A from '../../state/actions';
import { askText, engine, openMenu, patchUi, project, toast, ui, useCurrentPatternId, useEngine, useProject, useUi, type MenuItem } from '../../state/app';
import * as P from '../../state/persistence';
import { Icon } from '../components/Icon';
import { Knob } from '../components/Knob';
import { Meter } from '../components/Meter';
import { onFrame } from '../frame';
import { cx, pickFiles } from '../util';

export function fileMenuItems(): MenuItem[] {
  return [
    { label: 'Новый проект', action: () => void P.newProject(false) },
    { label: 'Новый из демо', action: () => void P.newProject(true) },
    { label: 'Открыть…', action: () => patchUi({ browserOpen: true }), hint: 'Браузер' },
    { label: 'Сохранить', action: () => void P.saveNow().then(() => toast('Проект сохранён', 'success')), hint: 'Ctrl+S' },
    {
      label: 'Сохранить как…',
      action: async () => {
        const name = await askText('Имя проекта', `${project.get().name} (копия)`);
        if (name) await P.saveAs(name);
      },
    },
    {
      label: 'Переименовать проект…',
      action: async () => {
        const name = await askText('Имя проекта', project.get().name);
        if (name) A.renameProject(name);
      },
    },
    { separator: true, label: '' },
    { label: 'Экспорт аудио (WAV, стемы)…', action: () => patchUi({ exportOpen: true }), hint: 'Ctrl+R' },
    { label: 'Экспорт MIDI — паттерн', action: () => P.exportMidi('pattern') },
    { label: 'Экспорт MIDI — вся песня', action: () => P.exportMidi('song') },
    { label: 'Экспорт файла проекта (.resonix)', action: () => void P.exportProjectToFile() },
    { separator: true, label: '' },
    { label: 'Импорт аудиофайлов…', action: async () => void P.importAudioFiles(await pickFiles('audio/*,.wav,.mp3,.ogg,.flac,.m4a', true)) },
    {
      label: 'Импорт MIDI в паттерн…',
      action: async () => {
        const [f] = await pickFiles('.mid,.midi,audio/midi');
        if (f) await P.importMidiFile(f);
      },
    },
    {
      label: 'Открыть файл проекта (.resonix / .zip)…',
      action: async () => {
        const [f] = await pickFiles('.resonix,.json,.zip,application/json,application/zip');
        if (f) await P.importProjectFromFile(f);
      },
    },
    { separator: true, label: '' },
    { label: 'Подключить MIDI-клавиатуру', action: () => void engine.connectMidi() },
  ];
}

function PositionDisplay() {
  const posRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  useEffect(
    () =>
      onFrame(() => {
        const p = project.get();
        const tick = engine.playheadTick();
        if (posRef.current) posRef.current.textContent = formatPosition(tick, p.timeSig);
        if (timeRef.current) timeRef.current.textContent = formatTime(engine.playheadSeconds());
      }),
    [],
  );
  return (
    <div className="lcd" title="Позиция: такт:доля:шаг">
      <span ref={posRef} className="lcd-main">
        1:1:01
      </span>
      <span ref={timeRef} className="lcd-sub">
        0:00.00
      </span>
    </div>
  );
}

function BpmField() {
  const bpm = useProject((p) => p.bpm);
  const drag = useRef<{ y: number; bpm: number; id: number } | null>(null);
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        className="bpm-input"
        autoFocus
        defaultValue={bpm}
        inputMode="decimal"
        onBlur={(e) => {
          const v = parseFloat(e.target.value.replace(',', '.'));
          if (Number.isFinite(v)) A.setBpm(v);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <div
      className="bpm"
      role="spinbutton"
      tabIndex={0}
      aria-label="Темп, BPM"
      aria-valuenow={bpm}
      title="Темп: тяните вверх/вниз, двойной клик — ввод"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, bpm, id: e.pointerId };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dy = drag.current.y - e.clientY;
        if (Math.abs(dy) < 2) return;
        A.setBpm(drag.current.bpm + Math.round(dy / (e.shiftKey ? 20 : 3)) * (e.shiftKey ? 0.1 : 1));
      }}
      onPointerUp={() => (drag.current = null)}
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') A.setBpm(bpm + 1);
        if (e.key === 'ArrowDown') A.setBpm(bpm - 1);
        if (e.key === 'Enter') setEditing(true);
      }}
    >
      <span className="bpm-value">{bpm.toFixed(bpm % 1 ? 2 : 0)}</span>
      <span className="bpm-unit">BPM</span>
    </div>
  );
}

function PatternPicker() {
  const patterns = useProject((p) => p.patterns);
  const current = useCurrentPatternId();
  const pat = patterns.find((p) => p.id === current);
  const menu = (x: number, y: number) =>
    openMenu(x, y, [
      { label: 'Новый паттерн', action: () => A.addPattern() },
      { label: 'Клонировать', action: () => current && A.clonePattern(current) },
      {
        label: 'Переименовать…',
        action: async () => {
          if (!pat) return;
          const name = await askText('Имя паттерна', pat.name);
          if (name) A.renamePattern(pat.id, name);
        },
      },
      {
        label: 'Добавить в плейлист',
        action: () => {
          const bar = ticksPerBar(project.get().timeSig);
          if (current) A.placePattern(current, Math.floor(engine.playheadTick() / bar) * bar);
        },
      },
      { separator: true, label: '' },
      ...[1, 2, 4, 8, 16].map((b) => ({ label: `Длина: ${b} ${b === 1 ? 'такт' : b < 5 ? 'такта' : 'тактов'}`, checked: pat?.bars === b, action: () => current && A.setPatternBars(current, b) })),
      { separator: true, label: '' },
      { label: 'Удалить паттерн', danger: true, action: () => current && A.deletePattern(current) },
    ]);
  return (
    <div className="pattern-picker">
      <span className="swatch" style={{ background: pat?.color }} />
      <select
        value={current ?? ''}
        onChange={(e) => {
          patchUi({ currentPatternId: e.target.value });
          engine.setPattern(e.target.value);
        }}
        aria-label="Текущий паттерн"
      >
        {patterns.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button className="icon-btn hide-mobile" title="Новый паттерн" onClick={() => A.addPattern()}>
        <Icon name="plus" size={16} />
      </button>
      <button className="icon-btn" title="Действия с паттерном" onClick={(e) => menu(e.clientX, e.clientY)}>
        <Icon name="dots" size={16} />
      </button>
    </div>
  );
}

function useHistory() {
  const sub = project.subscribeHistory;
  const canUndo = useSyncExternalStore(sub, project.canUndo);
  const canRedo = useSyncExternalStore(sub, project.canRedo);
  return { canUndo, canRedo };
}

export function TopBar() {
  const playing = useEngine((s) => s.playing);
  const recording = useEngine((s) => s.recording);
  const armed = useEngine((s) => s.recordArmed);
  const recordSource = useEngine((s) => s.recordSource);
  const mode = useEngine((s) => s.mode);
  const loop = useEngine((s) => s.loop);
  const metronome = useEngine((s) => s.metronome);
  const timeSig = useProject((p) => p.timeSig);
  const masterVol = useProject((p) => p.mixer[0].volume);
  const name = useProject((p) => p.name);
  const saveStatus = useUi((u) => u.saveStatus);
  const typing = useUi((u) => u.typingKeyboard);
  const browserOpen = useUi((u) => u.browserOpen);
  const { canUndo, canRedo } = useHistory();

  const recordMenu = (x: number, y: number) =>
    openMenu(x, y, [
      { label: 'Записывать ноты (клавиатура / MIDI)', checked: recordSource === 'midi', action: () => engine.setRecordSource('midi') },
      {
        label: 'Записывать звук (микрофон / вход)',
        checked: recordSource === 'audio',
        action: () => {
          engine.setRecordSource('audio');
          engine.setMode('song');
        },
      },
    ]);

  return (
    <header className="topbar">
      <div className="tb-group tb-brand">
        <button className="icon-btn" title="Меню" aria-label="Меню" onClick={(e) => openMenu(e.clientX, e.clientY + 8, fileMenuItems())}>
          <Icon name="menu" />
        </button>
        <button className={cx('icon-btn hide-mobile', browserOpen && 'active')} title="Браузер (F8)" aria-label="Браузер" onClick={() => patchUi({ browserOpen: !ui.get().browserOpen })}>
          <Icon name="browser" />
        </button>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ◢◣
          </span>
          <span className="brand-name" title={name}>
            {name}
          </span>
          <span className={`save-dot save-${saveStatus}`} title={{ saved: 'Сохранено', dirty: 'Есть несохранённые изменения', saving: 'Сохранение…', error: 'Ошибка сохранения' }[saveStatus]} />
        </div>
      </div>

      <div className="tb-group tb-history">
        <button className="icon-btn" disabled={!canUndo} onClick={() => project.undo()} title="Отменить (Ctrl+Z)" aria-label="Отменить">
          <Icon name="undo" />
        </button>
        <button className="icon-btn" disabled={!canRedo} onClick={() => project.redo()} title="Повторить (Ctrl+Y)" aria-label="Повторить">
          <Icon name="redo" />
        </button>
      </div>

      <div className="tb-group transport">
        <div className="seg" role="group" aria-label="Режим воспроизведения">
          <button className={cx(mode === 'pattern' && 'on')} onClick={() => engine.setMode('pattern')} title="Режим паттерна (L)">
            PAT
          </button>
          <button className={cx(mode === 'song' && 'on')} onClick={() => engine.setMode('song')} title="Режим песни (L)">
            SONG
          </button>
        </div>
        <button className={cx('tbtn play', playing && 'on')} onClick={() => (playing ? engine.pause() : void engine.play())} title="Воспроизведение / пауза (Space)" aria-label={playing ? 'Пауза' : 'Воспроизведение'}>
          <Icon name={playing ? 'pause' : 'play'} size={20} />
        </button>
        <button className="tbtn" onClick={() => engine.stop()} title="Стоп" aria-label="Стоп">
          <Icon name="stop" size={18} />
        </button>
        <button
          className={cx('tbtn rec', armed && 'armed', recording && 'on')}
          onClick={() => void engine.armRecord(!armed)}
          onContextMenu={(e) => {
            e.preventDefault();
            recordMenu(e.clientX, e.clientY);
          }}
          title={`Запись (R): ${recordSource === 'audio' ? 'звук' : 'ноты'}. Правый клик — источник`}
          aria-label="Запись"
          aria-pressed={armed}
        >
          <Icon name="record" size={18} />
        </button>
        <button className="tbtn small" onClick={(e) => recordMenu(e.clientX, e.clientY)} title="Источник записи" aria-label="Источник записи">
          <Icon name={recordSource === 'audio' ? 'mic' : 'midi'} size={16} />
        </button>
        <button className={cx('tbtn', loop && 'on')} onClick={() => engine.setLoop(!loop)} title="Зацикливание в режиме песни" aria-label="Цикл" aria-pressed={loop}>
          <Icon name="loop" size={18} />
        </button>
        <button className={cx('tbtn', metronome && 'on')} onClick={() => engine.setMetronome(!metronome)} title="Метроном" aria-label="Метроном" aria-pressed={metronome}>
          <Icon name="metronome" size={18} />
        </button>
      </div>

      <div className="tb-group tb-time">
        <PositionDisplay />
        <BpmField />
        <select
          className="timesig"
          value={`${timeSig[0]}/${timeSig[1]}`}
          onChange={(e) => {
            const [n, d] = e.target.value.split('/').map(Number);
            A.setTimeSig(n, d);
          }}
          aria-label="Размер такта"
          title="Размер такта"
        >
          {['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '12/8'].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="tb-group tb-pattern">
        <PatternPicker />
      </div>

      <div className="tb-group tb-right">
        <button
          className={cx('icon-btn', typing && 'active')}
          onClick={() => patchUi({ typingKeyboard: !typing })}
          title="Клавиатура компьютера как пианино (Z–M, Q–U)"
          aria-label="Клавиатура как пианино"
          aria-pressed={typing}
        >
          <Icon name="keyboard" />
        </button>
        <Knob spec={{ ...CHANNEL_VOLUME_SPEC, label: 'Master' }} value={masterVol} onChange={(v, c) => A.updateMixerTrack(0, { volume: v }, c)} automation={{ scope: 'mixer', trackIndex: 0, param: 'volume' }} format={(v) => `${(20 * Math.log10(Math.max(v, 1e-5))).toFixed(1)} dB`} compact size={30} />
        <Meter read={() => engine.stripLevels(0)} width={14} height={32} />
      </div>
    </header>
  );
}
