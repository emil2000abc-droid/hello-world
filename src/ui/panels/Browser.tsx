import { useEffect, useState, useSyncExternalStore } from 'react';
import { DRUM_KINDS, EFFECT_DEFS, EFFECT_TYPES } from '../../core/params';
import { listProjects, type ProjectMeta } from '../../project/db';
import { makeDrumChannel, makeSamplerChannel, makeSynthChannel, SYNTH_PRESETS } from '../../project/factory';
import * as A from '../../state/actions';
import { engine, openMenu, openWindow, patchUi, project, setView, ui, useCurrentPatternId, useProject, useUi } from '../../state/app';
import * as P from '../../state/persistence';
import { Icon } from '../components/Icon';
import { cx, pickFiles } from '../util';

export const DND_TYPE = 'application/x-resonix-item';

export interface DragItem {
  kind: 'pattern' | 'sample';
  id: string;
}

let bankVersion = 0;
engine.bank.subscribe(() => bankVersion++);
const useBank = () => {
  useSyncExternalStore(
    (l) => engine.bank.subscribe(l),
    () => bankVersion,
  );
  return engine.bank.list();
};

function Section({ title, icon, children, open: initial = true, action }: { title: string; icon: string; children: React.ReactNode; open?: boolean; action?: React.ReactNode }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className={cx('br-section', open && 'open')}>
      <header>
        <button className="br-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} />
          <Icon name={icon} size={14} />
          <span>{title}</span>
        </button>
        {action}
      </header>
      {open && <div className="br-items">{children}</div>}
    </section>
  );
}

function Projects() {
  const current = useProject((p) => p.id);
  const saveStatus = useUi((u) => u.saveStatus);
  const [list, setList] = useState<ProjectMeta[]>([]);
  useEffect(() => {
    listProjects().then(setList, () => setList([]));
  }, [current, saveStatus]);
  return (
    <Section
      title="Проекты"
      icon="folder"
      action={
        <button className="icon-btn" title="Новый проект" aria-label="Новый проект" onClick={() => void P.newProject(false)}>
          <Icon name="plus" size={14} />
        </button>
      }
    >
      {list.length === 0 && <div className="br-empty">Сохранённых проектов пока нет</div>}
      {list.map((m) => (
        <div key={m.id} className={cx('br-item', m.id === current && 'current')}>
          <button className="br-main" onClick={() => m.id !== current && void P.openProject(m.id)} title={`Изменён ${new Date(m.updatedAt).toLocaleString()}`}>
            {m.name}
          </button>
          {m.id !== current && (
            <button className="icon-btn" aria-label="Удалить проект" title="Удалить проект" onClick={async () => {
              if (confirm(`Удалить проект «${m.name}»?`)) {
                await P.removeProject(m.id);
                setList(await listProjects());
              }
            }}>
              <Icon name="trash" size={13} />
            </button>
          )}
        </div>
      ))}
    </Section>
  );
}

function Samples() {
  const samples = useBank();
  const builtins = samples.filter((s) => s.builtin);
  const user = samples.filter((s) => !s.builtin);
  const n = () => project.get().channels.length;
  const row = (s: (typeof samples)[number]) => (
    <div
      key={s.id}
      className="br-item"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_TYPE, JSON.stringify({ kind: 'sample', id: s.id } satisfies DragItem));
        e.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <button
        className="br-main"
        onClick={() => {
          const b = engine.bank.get(s.id);
          if (b) engine.previewBuffer(b);
        }}
        title="Клик — прослушать, перетащить — в плейлист"
      >
        <Icon name="wave" size={13} /> {s.name}
        <span className="br-meta">{s.duration.toFixed(1)}s</span>
      </button>
      <button
        className="icon-btn"
        aria-label="Действия"
        onClick={(e) =>
          openMenu(e.clientX, e.clientY, [
            { label: 'Новый канал-сэмплер', action: () => A.addChannel(makeSamplerChannel(s.id, s.name, n())) },
            {
              label: 'Рисовать в плейлисте',
              action: () => {
                patchUi({ playlist: { ...ui.get().playlist, brush: { kind: 'audio', id: s.id }, tool: 'draw' } });
                setView('playlist');
              },
            },
            { label: 'Добавить в плейлист в позицию', action: () => A.addAudioClip(s.id, s.duration, Math.floor(engine.playheadTick()), ui.get().selectedTrackId ?? undefined, ui.get().selectedMixerTrack) },
            ...(s.builtin ? [] : [{ separator: true, label: '' }, { label: 'Удалить сэмпл', danger: true, action: () => void P.deleteUserSample(s.id) }]),
          ])
        }
      >
        <Icon name="dots" size={13} />
      </button>
    </div>
  );
  return (
    <Section
      title="Сэмплы"
      icon="sample"
      action={
        <button className="icon-btn" title="Импорт аудио" aria-label="Импорт аудио" onClick={async () => void P.importAudioFiles(await pickFiles('audio/*,.wav,.mp3,.ogg,.flac,.m4a', true))}>
          <Icon name="upload" size={14} />
        </button>
      }
    >
      {user.length > 0 && <div className="br-sub">Мои сэмплы и записи</div>}
      {user.map(row)}
      <div className="br-sub">Встроенные</div>
      {builtins.map(row)}
    </Section>
  );
}

function Patterns() {
  const patterns = useProject((p) => p.patterns);
  const current = useCurrentPatternId();
  return (
    <Section
      title="Паттерны"
      icon="music"
      action={
        <button className="icon-btn" title="Новый паттерн" aria-label="Новый паттерн" onClick={() => A.addPattern()}>
          <Icon name="plus" size={14} />
        </button>
      }
    >
      {patterns.map((p) => (
        <div
          key={p.id}
          className={cx('br-item', p.id === current && 'current')}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DND_TYPE, JSON.stringify({ kind: 'pattern', id: p.id } satisfies DragItem));
            e.dataTransfer.effectAllowed = 'copy';
          }}
        >
          <button
            className="br-main"
            onClick={() => {
              patchUi({ currentPatternId: p.id, playlist: { ...ui.get().playlist, brush: null } });
              engine.setPattern(p.id);
            }}
            title="Клик — выбрать, перетащить — в плейлист"
          >
            <span className="swatch" style={{ background: p.color }} /> {p.name}
            <span className="br-meta">{p.bars} т.</span>
          </button>
          <button className="icon-btn" aria-label="В плейлист" title="Добавить в плейлист" onClick={() => A.placePattern(p.id, 0)}>
            <Icon name="playlist" size={13} />
          </button>
        </div>
      ))}
    </Section>
  );
}

export function Browser() {
  const n = () => project.get().channels.length;
  return (
    <aside className="browser" aria-label="Браузер">
      <div className="panel-toolbar">
        <span className="panel-title">Браузер</span>
        <div className="spacer" />
        <button className="icon-btn" aria-label="Закрыть браузер" onClick={() => patchUi({ browserOpen: false })}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="br-scroll">
        <Projects />
        <Patterns />
        <Section title="Синтезаторы" icon="synth">
          {Object.keys(SYNTH_PRESETS).map((name) => (
            <button key={name} className="br-item br-main" onClick={() => A.addChannel(makeSynthChannel(name, n()))} title="Добавить канал">
              <Icon name="plus" size={12} /> {name}
            </button>
          ))}
        </Section>
        <Section title="Драм-машина" icon="drum">
          {DRUM_KINDS.map((k) => (
            <button key={k.value} className="br-item br-main" onClick={() => A.addChannel(makeDrumChannel(k.value, n()))} title="Добавить канал">
              <Icon name="plus" size={12} /> {k.label}
            </button>
          ))}
        </Section>
        <Samples />
        <Section title="Эффекты" icon="fx" open={false}>
          {EFFECT_TYPES.map((t) => (
            <button
              key={t}
              className="br-item br-main"
              onClick={() => {
                const idx = ui.get().selectedMixerTrack;
                const id = A.addEffect(idx, t);
                openWindow({ kind: 'effect', trackIndex: idx, effectId: id });
              }}
              title="Добавить на выбранный канал микшера"
            >
              <Icon name="plus" size={12} /> {EFFECT_DEFS[t].name}
            </button>
          ))}
        </Section>
      </div>
    </aside>
  );
}
