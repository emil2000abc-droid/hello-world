import { memo } from 'react';
import { formatDb } from '../../core/music';
import { CHANNEL_PAN_SPEC, CHANNEL_VOLUME_SPEC, EFFECT_DEFS, EFFECT_TYPES } from '../../core/params';
import type { MixerTrack } from '../../core/types';
import * as A from '../../state/actions';
import { askText, engine, openMenu, openWindow, patchUi, useProject, useUi } from '../../state/app';
import { Icon } from '../components/Icon';
import { Fader, Knob } from '../components/Knob';
import { Meter } from '../components/Meter';
import { cx } from '../util';

const Strip = memo(function Strip({ track, index, selected, sources }: { track: MixerTrack; index: number; selected: boolean; sources: string }) {
  const isMaster = index === 0;
  return (
    <div
      className={cx('strip', isMaster && 'master', selected && 'selected', track.mute && 'muted')}
      style={{ '--trk': track.color } as React.CSSProperties}
      onPointerDown={() => patchUi({ selectedMixerTrack: index })}
    >
      <div className="strip-num">{isMaster ? 'M' : index}</div>
      <div
        className="strip-name"
        title={`${track.name}${sources ? `\nВходы: ${sources}` : ''}\nДвойной клик — переименовать`}
        onDoubleClick={async () => {
          const name = await askText('Имя канала микшера', track.name);
          if (name) A.updateMixerTrack(index, { name });
        }}
      >
        {track.name}
      </div>
      <div className="strip-fx" title="Эффекты">
        {track.effects.slice(0, 4).map((e) => (
          <span key={e.id} className={cx('fx-dot', e.bypass && 'off')} title={EFFECT_DEFS[e.type].name} />
        ))}
      </div>
      <Knob spec={CHANNEL_PAN_SPEC} value={track.pan} onChange={(v, c) => A.updateMixerTrack(index, { pan: v }, c)} automation={{ scope: 'mixer', trackIndex: index, param: 'pan' }} bipolar compact size={26} label="Pan" format={(v) => (Math.abs(v) < 0.01 ? 'C' : `${Math.round(Math.abs(v) * 100)}${v < 0 ? 'L' : 'R'}`)} />
      <div className="strip-fader">
        <Fader spec={CHANNEL_VOLUME_SPEC} value={track.volume} onChange={(v, c) => A.updateMixerTrack(index, { volume: v }, c)} automation={{ scope: 'mixer', trackIndex: index, param: 'volume' }} format={formatDb} label="Громкость" height={140} />
        <Meter read={() => engine.stripLevels(index)} width={12} height={140} />
      </div>
      <div className="strip-buttons">
        <button className={cx('mini', track.mute && 'on-red')} onClick={() => A.updateMixerTrack(index, { mute: !track.mute })} aria-pressed={track.mute} title="Mute">
          M
        </button>
        {!isMaster && (
          <button className={cx('mini', track.solo && 'on-yellow')} onClick={() => A.updateMixerTrack(index, { solo: !track.solo })} aria-pressed={track.solo} title="Solo">
            S
          </button>
        )}
      </div>
    </div>
  );
});

function FxChain({ index }: { index: number }) {
  const track = useProject((p) => p.mixer[index]);
  const channels = useProject((p) => p.channels);
  if (!track) return null;
  const feeds = channels.filter((c) => c.mixerTrack === index);
  return (
    <div className="fx-chain">
      <div className="fx-chain-head">
        <span className="swatch" style={{ background: track.color }} />
        <strong>{index === 0 ? 'Master' : `${index} · ${track.name}`}</strong>
      </div>
      <div className="fx-feeds">{feeds.length ? `Входы: ${feeds.map((c) => c.name).join(', ')}` : index === 0 ? 'Все каналы микшера' : 'Нет входов — выберите этот номер у канала в Channel Rack'}</div>
      <ol className="fx-slots">
        {track.effects.map((fx, i) => (
          <li key={fx.id} className={cx('fx-slot', fx.bypass && 'bypassed')}>
            <button className={cx('icon-btn', !fx.bypass && 'active')} onClick={() => A.setEffectBypass(index, fx.id, !fx.bypass)} title={fx.bypass ? 'Включить' : 'Обойти (bypass)'} aria-pressed={!fx.bypass} aria-label="Bypass">
              <Icon name="power" size={14} />
            </button>
            <button className="fx-name" onClick={() => openWindow({ kind: 'effect', trackIndex: index, effectId: fx.id })}>
              {EFFECT_DEFS[fx.type].name}
            </button>
            <button className="icon-btn" disabled={i === 0} onClick={() => A.moveEffect(index, fx.id, -1)} aria-label="Выше" title="Выше">
              <Icon name="chevronUp" size={14} />
            </button>
            <button className="icon-btn" disabled={i === track.effects.length - 1} onClick={() => A.moveEffect(index, fx.id, 1)} aria-label="Ниже" title="Ниже">
              <Icon name="chevronDown" size={14} />
            </button>
            <button className="icon-btn" onClick={() => A.removeEffect(index, fx.id)} aria-label="Удалить" title="Удалить">
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
      </ol>
      <button
        className="btn add-fx"
        disabled={track.effects.length >= 10}
        onClick={(e) =>
          openMenu(
            e.clientX,
            e.clientY,
            EFFECT_TYPES.map((t) => ({
              label: EFFECT_DEFS[t].name,
              action: () => {
                const id = A.addEffect(index, t);
                openWindow({ kind: 'effect', trackIndex: index, effectId: id });
              },
            })),
          )
        }
      >
        <Icon name="plus" size={14} /> Добавить эффект
      </button>
    </div>
  );
}

export function Mixer() {
  const mixer = useProject((p) => p.mixer);
  const channels = useProject((p) => p.channels);
  const selected = useUi((u) => u.selectedMixerTrack);
  const sel = Math.min(selected, mixer.length - 1);
  return (
    <div className="mixer">
      <div className="panel-toolbar">
        <span className="panel-title">Mixer</span>
        <span className="dim">Двойной клик по имени — переименовать · правый клик по ручке — автоматизация</span>
      </div>
      <div className="mixer-body">
        <div className="strips">
          {mixer.map((t, i) => (
            <Strip key={t.id} track={t} index={i} selected={i === sel} sources={channels.filter((c) => c.mixerTrack === i).map((c) => c.name).join(', ')} />
          ))}
        </div>
        <FxChain index={sel} />
      </div>
    </div>
  );
}
