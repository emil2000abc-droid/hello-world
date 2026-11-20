// Portable project files (.resonix): project JSON with its user samples
// embedded as WAV, plus helpers for downloads and loading untrusted data.

import { defaultParams, EFFECT_DEFS, instrumentSpecs, isParamValue } from '../core/params';
import { uid } from '../core/music';
import type { Clip, ParamMap, Project } from '../core/types';
import { audioBufferToWav } from '../audio/wav';
import { makeMixer, makeTracks, MIXER_INSERTS } from './factory';
import { createZip } from './zip';

const FORMAT = 'resonix-project';

interface FileSample {
  id: string;
  name: string;
  wav: string;
}

interface ProjectFile {
  format: typeof FORMAT;
  version: 1;
  project: Project;
  samples: FileSample[];
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

function fromBase64(b64: string): ArrayBuffer {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}

export function exportProjectFile(project: Project, sample: (id: string) => AudioBuffer | undefined): Blob {
  const used = new Set<string>();
  for (const c of project.clips) if (c.kind === 'audio') used.add(c.sampleId);
  for (const ch of project.channels) if (ch.type === 'sampler' && typeof ch.params.sampleId === 'string') used.add(ch.params.sampleId);
  const samples: FileSample[] = [];
  for (const id of used) {
    if (id.startsWith('builtin:')) continue;
    const buf = sample(id);
    if (!buf) continue;
    samples.push({ id, name: project.samples.find((s) => s.id === id)?.name ?? id, wav: toBase64(audioBufferToWav(buf, 16)) });
  }
  const file: ProjectFile = { format: FORMAT, version: 1, project, samples };
  return new Blob([JSON.stringify(file)], { type: 'application/json' });
}

export async function importProjectFile(text: string, ctx: BaseAudioContext): Promise<{ project: Project; samples: { id: string; name: string; buffer: AudioBuffer }[] }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Файл повреждён или не является проектом');
  }
  const file = parsed as Partial<ProjectFile>;
  if (file.format !== FORMAT || !file.project) throw new Error('Это не файл проекта Resonix');
  const project = sanitizeProject(file.project);
  const samples: { id: string; name: string; buffer: AudioBuffer }[] = [];
  for (const s of file.samples ?? []) {
    if (typeof s?.id !== 'string' || typeof s.wav !== 'string') continue;
    try {
      const buffer = await ctx.decodeAudioData(fromBase64(s.wav));
      samples.push({ id: s.id, name: String(s.name ?? s.id), buffer });
    } catch {
      /* skip undecodable sample */
    }
  }
  return { project, samples };
}

interface HostDownloads {
  save(req: { filename: string; data: Blob | ArrayBuffer | ArrayBufferView }): Promise<{ status: string }>;
}

/** Extensions a claude.ai artifact host will save directly; others go inside a zip. */
const HOST_EXTENSIONS = new Set(['txt', 'json', 'md', 'csv', 'zip', 'html', 'svg', 'pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm']);

let hostDownloads: Promise<HostDownloads | null> | null = null;

/** The host's save capability when running as a published artifact, else null. */
function getHostDownloads(): Promise<HostDownloads | null> {
  const claude = (window as unknown as { claude?: { use?: (name: string) => Promise<unknown> } }).claude;
  if (typeof claude?.use !== 'function') return Promise.resolve(null);
  hostDownloads ??= claude.use('downloads').then((d) => (d as HostDownloads | null) ?? null, () => null);
  return hostDownloads;
}

function anchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Save a generated file. In a normal tab this is a plain download; inside a
 * claude.ai artifact it goes through the host (which asks the viewer) and is
 * zipped when the host does not accept its extension.
 * Resolves false if the viewer declined.
 */
export async function saveFile(blob: Blob, filename: string): Promise<boolean> {
  const host = await getHostDownloads();
  if (!host) {
    anchorDownload(blob, filename);
    return true;
  }
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  let data: Blob = blob;
  let name = filename;
  if (!HOST_EXTENSIONS.has(ext)) {
    data = new Blob([createZip([{ name: filename, data: new Uint8Array(await blob.arrayBuffer()) }])], { type: 'application/zip' });
    name = `${filename}.zip`;
  }
  try {
    await host.save({ filename: name, data });
    return true;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'declined') return false;
    throw new Error(code === 'unavailable' || code === 'not_granted' ? 'Сохранение файлов недоступно в этом окне' : ((e as Error).message ?? 'Не удалось сохранить файл'));
  }
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'project';
}

const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const strv = (v: unknown, d: string) => (typeof v === 'string' ? v : d);

function cleanParams(raw: unknown, defaults: ParamMap): ParamMap {
  const out: ParamMap = { ...defaults };
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (isParamValue(v)) out[k] = v;
  }
  return out;
}

/** Fill in missing fields and drop malformed data from a loaded project. */
export function sanitizeProject(raw: Project): Project {
  const p = raw as Partial<Project>;
  const mixer = Array.isArray(p.mixer) && p.mixer.length ? p.mixer : makeMixer();
  while (mixer.length < MIXER_INSERTS + 1) mixer.push(makeMixer()[mixer.length]);
  const channels = (Array.isArray(p.channels) ? p.channels : []).filter((c) => c && ['synth', 'drum', 'sampler'].includes(c.type)).map((c) => ({
    ...c,
    id: strv(c.id, uid('ch')),
    name: strv(c.name, 'Channel'),
    color: strv(c.color, '#888'),
    params: cleanParams(c.params, defaultParams(instrumentSpecs(c.type))),
    volume: num(c.volume, 0.8, 0, 1.25),
    pan: num(c.pan, 0, -1, 1),
    mute: !!c.mute,
    mixerTrack: num(c.mixerTrack, 0, 0, mixer.length - 1),
    stepPitch: num(c.stepPitch, 60, 0, 127),
  }));
  const tracks = Array.isArray(p.tracks) && p.tracks.length ? p.tracks : makeTracks();
  const trackIds = new Set(tracks.map((t) => t.id));
  const patterns = (Array.isArray(p.patterns) ? p.patterns : []).map((pt) => ({
    ...pt,
    bars: num(pt.bars, 1, 1, 64),
    notes: pt.notes && typeof pt.notes === 'object' ? pt.notes : {},
  }));
  const clips = (Array.isArray(p.clips) ? p.clips : []).filter((c: Clip) => c && trackIds.has(c.trackId) && num(c.length, 0) > 0);
  return {
    version: 1,
    id: strv(p.id, uid('pr')),
    name: strv(p.name, 'Untitled'),
    bpm: num(p.bpm, 120, 20, 999),
    timeSig: Array.isArray(p.timeSig) && p.timeSig.length === 2 ? [num(p.timeSig[0], 4, 1, 16), [2, 4, 8, 16].includes(p.timeSig[1]) ? p.timeSig[1] : 4] : [4, 4],
    swing: num(p.swing, 0, 0, 1),
    channels,
    patterns: patterns.length ? patterns : [{ id: uid('pt'), name: 'Pattern 1', color: '#7e7fe8', bars: 1, notes: {} }],
    tracks,
    clips,
    mixer: mixer.map((t) => ({
      ...t,
      effects: (Array.isArray(t.effects) ? t.effects : [])
        .filter((e) => e && e.type in EFFECT_DEFS)
        .map((e) => ({ ...e, params: cleanParams(e.params, defaultParams(EFFECT_DEFS[e.type].params)) })),
    })),
    samples: Array.isArray(p.samples) ? p.samples : [],
    loop: p.loop && num(p.loop.end, 0) > num(p.loop.start, 0) ? p.loop : null,
    createdAt: num(p.createdAt, Date.now()),
    updatedAt: num(p.updatedAt, Date.now()),
  };
}
