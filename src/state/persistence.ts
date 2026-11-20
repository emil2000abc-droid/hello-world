// Project lifecycle: autosave, open/new/import/export, sample import and
// recording hand-off.

import { patternLengthTicks, uid } from '../core/music';
import type { Project } from '../core/types';
import { normalize, renderProject } from '../audio/render';
import { audioBufferToWav, type WavBitDepth } from '../audio/wav';
import * as db from '../project/db';
import { demoProject, emptyProject, makeChannel, makeNote } from '../project/factory';
import { downloadBlob, exportProjectFile, importProjectFile, safeFileName, sanitizeProject } from '../project/file';
import { notesToTrack, readMidi, writeMidi, type MidiTrackData } from '../project/midi';
import { addAudioClip, registerSample } from './actions';
import { currentPatternId, engine, patchUi, project, toast, ui } from './app';

let saveTimer: number | null = null;
let lastSaved: Project | null = null;

export function scheduleAutosave(): void {
  if (project.get() === lastSaved) return;
  patchUi({ saveStatus: 'dirty' });
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveNow(), 1500);
}

export async function saveNow(): Promise<void> {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = null;
  const p = { ...project.get(), updatedAt: Date.now() };
  patchUi({ saveStatus: 'saving' });
  try {
    await db.saveProject(p);
    lastSaved = project.get();
    patchUi({ saveStatus: 'saved' });
  } catch {
    patchUi({ saveStatus: 'error' });
  }
}

/** Load user samples referenced by a project from IndexedDB into the bank. */
async function loadProjectSamples(p: Project): Promise<void> {
  const ids = new Set<string>();
  for (const c of p.clips) if (c.kind === 'audio') ids.add(c.sampleId);
  for (const ch of p.channels) if (typeof ch.params.sampleId === 'string') ids.add(ch.params.sampleId);
  for (const s of p.samples) ids.add(s.id);
  await Promise.all(
    [...ids]
      .filter((id) => !id.startsWith('builtin:') && !engine.bank.has(id))
      .map(async (id) => {
        try {
          const s = await db.loadSample(id);
          if (s) engine.bank.add(s.id, s.name, db.storedToBuffer(s));
        } catch {
          /* missing sample: clip stays silent */
        }
      }),
  );
}

export async function loadUserSampleLibrary(): Promise<void> {
  try {
    for (const s of await db.listSamples()) if (!engine.bank.has(s.id)) engine.bank.add(s.id, s.name, db.storedToBuffer(s));
  } catch {
    /* IndexedDB unavailable */
  }
}

function applyProject(p: Project): void {
  engine.stop();
  engine.seek(0);
  project.replace(p, true);
  lastSaved = p;
  patchUi({
    currentPatternId: p.patterns[0]?.id ?? null,
    selectedChannelId: p.channels[0]?.id ?? null,
    selectedTrackId: p.tracks[0]?.id ?? null,
    windows: [],
    piano: { ...ui.get().piano, selection: [] },
    playlist: { ...ui.get().playlist, selection: [], brush: null },
    saveStatus: 'saved',
  });
}

export async function restoreLastSession(): Promise<void> {
  try {
    const id = await db.lastProjectId();
    const p = id ? await db.loadProject(id) : null;
    if (p) {
      const clean = sanitizeProject(p);
      await loadProjectSamples(clean);
      applyProject(clean);
      return;
    }
  } catch {
    /* fall through to demo */
  }
  applyProject(project.get());
  void saveNow();
}

export async function newProject(demo = false): Promise<void> {
  await saveNow();
  applyProject(demo ? demoProject() : emptyProject('Новый проект'));
  void saveNow();
}

export async function openProject(id: string): Promise<void> {
  await saveNow();
  const p = await db.loadProject(id);
  if (!p) {
    toast('Проект не найден', 'error');
    return;
  }
  const clean = sanitizeProject(p);
  await loadProjectSamples(clean);
  applyProject(clean);
  toast(`Открыт проект «${clean.name}»`, 'success');
}

export async function saveAs(name: string): Promise<void> {
  const copy: Project = { ...structuredClone(project.get()), id: uid('pr'), name, createdAt: Date.now(), updatedAt: Date.now() };
  applyProject(copy);
  await saveNow();
  toast(`Сохранено как «${name}»`, 'success');
}

export async function removeProject(id: string): Promise<void> {
  if (id === project.get().id) {
    toast('Нельзя удалить открытый проект', 'error');
    return;
  }
  await db.deleteProject(id);
}

export function exportProjectToFile(): void {
  const p = project.get();
  downloadBlob(exportProjectFile(p, engine.bank.get), `${safeFileName(p.name)}.resonix`);
}

export async function importProjectFromFile(file: File): Promise<void> {
  try {
    const { project: p, samples } = await importProjectFile(await file.text(), engine.ctx);
    for (const s of samples) {
      engine.bank.add(s.id, s.name, s.buffer);
      await db.saveSample(db.bufferToStored(s.id, s.name, s.buffer)).catch(() => {});
    }
    await saveNow();
    applyProject({ ...p, id: uid('pr') });
    await saveNow();
    toast(`Проект «${p.name}» импортирован`, 'success');
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}

// ---------------------------------------------------------------- samples

export async function storeSample(name: string, buffer: AudioBuffer): Promise<string> {
  const id = uid('smp');
  engine.bank.add(id, name, buffer);
  registerSample(id, name, buffer.duration);
  try {
    await db.saveSample(db.bufferToStored(id, name, buffer));
  } catch {
    toast('Сэмпл не сохранён в браузере — он пропадёт после перезагрузки', 'error');
  }
  return id;
}

export async function importAudioFiles(files: FileList | File[]): Promise<string[]> {
  const ids: string[] = [];
  for (const f of Array.from(files)) {
    try {
      const buffer = await engine.ctx.decodeAudioData(await f.arrayBuffer());
      ids.push(await storeSample(f.name.replace(/\.[^.]+$/, ''), buffer));
    } catch {
      toast(`Не удалось декодировать «${f.name}»`, 'error');
    }
  }
  if (ids.length) toast(`Импортировано сэмплов: ${ids.length}`, 'success');
  return ids;
}

export async function deleteUserSample(id: string): Promise<void> {
  const p = project.get();
  const inUse = p.clips.some((c) => c.kind === 'audio' && c.sampleId === id) || p.channels.some((c) => c.params.sampleId === id);
  if (inUse) {
    toast('Сэмпл используется в проекте', 'error');
    return;
  }
  engine.bank.remove(id);
  await db.deleteSample(id).catch(() => {});
}

/** Wire engine recording callbacks into project edits. */
export function connectRecording(): void {
  engine.onRecordedAudio = (buffer, tick) => {
    void (async () => {
      const n = project.get().clips.filter((c) => c.kind === 'audio').length + 1;
      const id = await storeSample(`Запись ${n}`, buffer);
      const u = ui.get();
      const track = u.selectedTrackId && project.get().tracks.some((t) => t.id === u.selectedTrackId) ? u.selectedTrackId : undefined;
      addAudioClip(id, buffer.duration, tick, track, u.selectedMixerTrack);
      toast('Аудиозапись добавлена в плейлист', 'success');
    })();
  };
  engine.onRecordedNote = (n) => {
    project.edit((d) => {
      const pat = d.patterns.find((p) => p.id === n.patternId);
      if (!pat) return;
      (pat.notes[n.channelId] ??= []).push(makeNote(n.pitch, n.start, n.length, n.velocity));
    }, 'record');
  };
}

// ---------------------------------------------------------------- export

export interface ExportOptions {
  mode: 'song' | 'pattern';
  bitDepth: WavBitDepth;
  sampleRate: number;
  normalize: boolean;
  tail: number;
  stems: boolean;
}

export async function exportAudio(opts: ExportOptions, onProgress: (text: string) => void): Promise<void> {
  const p = project.get();
  const patternId = currentPatternId();
  const base = safeFileName(p.name);
  const render = async (soloInsert: number | null) => {
    const buf = await renderProject(p, engine.bank.get, { mode: opts.mode, patternId, sampleRate: opts.sampleRate, tail: opts.tail, soloInsert });
    if (opts.normalize) normalize(buf);
    return new Blob([audioBufferToWav(buf, opts.bitDepth)], { type: 'audio/wav' });
  };
  if (!opts.stems) {
    onProgress('Рендеринг микса…');
    downloadBlob(await render(null), `${base}.wav`);
    return;
  }
  const used = [...new Set([...p.channels.map((c) => c.mixerTrack), ...p.clips.flatMap((c) => (c.kind === 'audio' ? [c.mixerTrack] : []))])].filter((i) => i > 0).sort((a, b) => a - b);
  for (const [n, i] of used.entries()) {
    onProgress(`Стем ${n + 1}/${used.length}: ${p.mixer[i].name}`);
    downloadBlob(await render(i), `${base} - ${String(i).padStart(2, '0')} ${safeFileName(p.mixer[i].name)}.wav`);
  }
}

export function exportMidi(scope: 'pattern' | 'song'): void {
  const p = project.get();
  const tracks: MidiTrackData[] = [];
  if (scope === 'pattern') {
    const pat = p.patterns.find((x) => x.id === currentPatternId());
    if (!pat) return;
    for (const ch of p.channels) {
      const notes = pat.notes[ch.id];
      if (notes?.length) tracks.push(notesToTrack(ch.name, notes));
    }
  } else {
    const byId = new Map(p.patterns.map((x) => [x.id, x]));
    for (const ch of p.channels) {
      const out: MidiTrackData['notes'] = [];
      for (const c of p.clips) {
        if (c.kind !== 'pattern') continue;
        const pat = byId.get(c.patternId);
        const notes = pat?.notes[ch.id];
        if (!pat || !notes) continue;
        const len = patternLengthTicks(pat, p.timeSig);
        for (let rep = 0; rep * len < c.length; rep++) {
          for (const n of notes) {
            const t = rep * len + n.start;
            if (t < c.length) out.push({ pitch: n.pitch, start: c.start + t, length: Math.min(n.length, c.length - t), velocity: n.velocity });
          }
        }
      }
      if (out.length) tracks.push({ name: ch.name, notes: out.sort((a, b) => a.start - b.start) });
    }
  }
  if (!tracks.length) {
    toast('Нет нот для экспорта', 'error');
    return;
  }
  const bytes = writeMidi({ bpm: p.bpm, timeSig: p.timeSig, tracks });
  downloadBlob(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'audio/midi' }), `${safeFileName(p.name)}${scope === 'pattern' ? ' - pattern' : ''}.mid`);
}

/** Import a .mid file into the current pattern, one synth channel per track. */
export async function importMidiFile(file: File): Promise<void> {
  try {
    const data = readMidi(new Uint8Array(await file.arrayBuffer()));
    if (!data.tracks.length) {
      toast('В файле нет нот', 'error');
      return;
    }
    const patId = currentPatternId();
    project.edit((d) => {
      const pat = d.patterns.find((x) => x.id === patId);
      if (!pat) return;
      let maxEnd = 0;
      data.tracks.forEach((t, i) => {
        const ch = makeChannel('synth', t.name, d.channels.length + i);
        d.channels.push(ch);
        pat.notes[ch.id] = t.notes.map((n) => {
          maxEnd = Math.max(maxEnd, n.start + n.length);
          return makeNote(n.pitch, n.start, n.length, n.velocity);
        });
      });
      const barTicks = (96 * 4 * d.timeSig[0]) / d.timeSig[1];
      pat.bars = Math.min(64, Math.max(pat.bars, Math.ceil(maxEnd / barTicks)));
    });
    toast(`MIDI импортирован: дорожек ${data.tracks.length}`, 'success');
  } catch (e) {
    toast((e as Error).message, 'error');
  }
}
