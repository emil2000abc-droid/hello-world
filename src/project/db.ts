// IndexedDB persistence for projects and user samples.

import type { Project } from '../core/types';

const DB_NAME = 'resonix-studio';
const DB_VERSION = 1;

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
}

interface StoredProject extends ProjectMeta {
  data: Project;
}

export interface StoredSample {
  id: string;
  name: string;
  sampleRate: number;
  channels: Float32Array[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB недоступен'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('samples')) db.createObjectStore('samples', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req ? req.result : undefined);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export async function saveProject(project: Project): Promise<void> {
  const rec: StoredProject = { id: project.id, name: project.name, updatedAt: project.updatedAt, data: project };
  await tx('projects', 'readwrite', (s) => s.put(rec));
  await tx('meta', 'readwrite', (s) => s.put(project.id, 'lastProject'));
}

export async function loadProject(id: string): Promise<Project | null> {
  const rec = await tx<StoredProject>('projects', 'readonly', (s) => s.get(id));
  return rec?.data ?? null;
}

export async function listProjects(): Promise<ProjectMeta[]> {
  const all = (await tx<StoredProject[]>('projects', 'readonly', (s) => s.getAll())) ?? [];
  return all.map(({ id, name, updatedAt }) => ({ id, name, updatedAt })).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: string): Promise<void> {
  await tx('projects', 'readwrite', (s) => s.delete(id));
}

export async function lastProjectId(): Promise<string | null> {
  const id = await tx<string>('meta', 'readonly', (s) => s.get('lastProject'));
  return typeof id === 'string' ? id : null;
}

export async function saveSample(sample: StoredSample): Promise<void> {
  await tx('samples', 'readwrite', (s) => s.put(sample));
}

export async function loadSample(id: string): Promise<StoredSample | null> {
  return (await tx<StoredSample>('samples', 'readonly', (s) => s.get(id))) ?? null;
}

export async function listSamples(): Promise<StoredSample[]> {
  return (await tx<StoredSample[]>('samples', 'readonly', (s) => s.getAll())) ?? [];
}

export async function deleteSample(id: string): Promise<void> {
  await tx('samples', 'readwrite', (s) => s.delete(id));
}

export function bufferToStored(id: string, name: string, buffer: AudioBuffer): StoredSample {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c).slice());
  return { id, name, sampleRate: buffer.sampleRate, channels };
}

export function storedToBuffer(s: StoredSample): AudioBuffer {
  const buf = new AudioBuffer({ length: Math.max(1, s.channels[0]?.length ?? 1), numberOfChannels: Math.max(1, s.channels.length), sampleRate: s.sampleRate });
  s.channels.forEach((ch, i) => buf.copyToChannel(ch as Float32Array<ArrayBuffer>, i));
  return buf;
}
