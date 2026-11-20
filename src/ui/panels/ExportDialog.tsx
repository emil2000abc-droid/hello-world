import { useState } from 'react';
import { formatTime, secondsPerTick } from '../../core/music';
import type { WavBitDepth } from '../../audio/wav';
import { renderLength } from '../../audio/render';
import { currentPatternId, patchUi, project, toast, useUi } from '../../state/app';
import { exportAudio, exportMidi, type ExportOptions } from '../../state/persistence';
import { Icon } from '../components/Icon';

export function ExportDialog() {
  const open = useUi((u) => u.exportOpen);
  const [opts, setOpts] = useState<ExportOptions>({ mode: 'song', bitDepth: 24, sampleRate: 44100, normalize: false, tail: 2.5, stems: false });
  const [busy, setBusy] = useState<string | null>(null);
  if (!open) return null;
  const p = project.get();
  const range = renderLength(p, { mode: opts.mode, patternId: currentPatternId() });
  const seconds = (range.to - range.from) * secondsPerTick(p.bpm) + opts.tail;
  const set = (patch: Partial<ExportOptions>) => setOpts({ ...opts, ...patch });
  const close = () => !busy && patchUi({ exportOpen: false });

  const run = async () => {
    setBusy('Подготовка…');
    try {
      await exportAudio(opts, setBusy);
      toast('Экспорт завершён', 'success');
      patchUi({ exportOpen: false });
    } catch (e) {
      toast(`Ошибка экспорта: ${(e as Error).message}`, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal export" role="dialog" aria-label="Экспорт">
        <h3>
          <Icon name="download" /> Экспорт
        </h3>
        <div className="form-grid">
          <label>Что</label>
          <div className="seg">
            <button className={opts.mode === 'song' ? 'on' : ''} onClick={() => set({ mode: 'song' })}>
              Вся песня
            </button>
            <button className={opts.mode === 'pattern' ? 'on' : ''} onClick={() => set({ mode: 'pattern' })}>
              Текущий паттерн
            </button>
          </div>
          <label>Формат</label>
          <select value={opts.bitDepth} onChange={(e) => set({ bitDepth: Number(e.target.value) as WavBitDepth })}>
            <option value={16}>WAV 16-bit</option>
            <option value={24}>WAV 24-bit</option>
            <option value={32}>WAV 32-bit float</option>
          </select>
          <label>Частота</label>
          <select value={opts.sampleRate} onChange={(e) => set({ sampleRate: Number(e.target.value) })}>
            <option value={44100}>44 100 Гц</option>
            <option value={48000}>48 000 Гц</option>
            <option value={96000}>96 000 Гц</option>
          </select>
          <label>Хвост</label>
          <select value={opts.tail} onChange={(e) => set({ tail: Number(e.target.value) })}>
            {[0, 1, 2.5, 5, 10].map((t) => (
              <option key={t} value={t}>
                {t} с
              </option>
            ))}
          </select>
          <label>Опции</label>
          <div className="checks">
            <label>
              <input type="checkbox" checked={opts.normalize} onChange={(e) => set({ normalize: e.target.checked })} /> Нормализовать
            </label>
            <label>
              <input type="checkbox" checked={opts.stems} onChange={(e) => set({ stems: e.target.checked })} /> Стемы (каждый канал микшера отдельно)
            </label>
          </div>
        </div>
        <p className="dim">Длительность: {formatTime(seconds)} · рендер быстрее реального времени, офлайн</p>
        {busy && <div className="progress">{busy}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={() => exportMidi(opts.mode)} disabled={!!busy}>
            <Icon name="midi" size={14} /> MIDI
          </button>
          <div className="spacer" />
          <button className="btn" onClick={close} disabled={!!busy}>
            Отмена
          </button>
          <button className="btn primary" onClick={() => void run()} disabled={!!busy}>
            <Icon name="download" size={14} /> Рендерить WAV
          </button>
        </div>
      </div>
    </div>
  );
}
