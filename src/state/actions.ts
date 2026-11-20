// All project edits go through here, so the UI never mutates data directly
// and every change lands in the undo history.

import { targetLabel, targetNormalizedValue } from '../core/automation';
import { paletteColor, patternLengthTicks, secondsPerTick, songLengthTicks, ticksPerBar, uid } from '../core/music';
import type { Draft } from 'immer';
import {
  TICKS_PER_STEP,
  type AudioClip,
  type AutomationPoint,
  type AutomationTarget,
  type Channel,
  type Clip,
  type EffectType,
  type ID,
  type MixerTrack,
  type Note,
  type ParamValue,
  type Project,
} from '../core/types';
import { makeAutomationClip, makeEffect, makeNote, makePattern, makePatternClip } from '../project/factory';
import { engine, patchUi, project, toast, ui } from './app';

const edit = (fn: (d: Draft<Project>) => void, coalesce?: string) => project.edit(fn, coalesce);

// ---------------------------------------------------------------- project

export function setBpm(bpm: number): void {
  edit((d) => {
    d.bpm = Math.min(999, Math.max(20, Math.round(bpm * 100) / 100));
  }, 'bpm');
}

export function setTimeSig(num: number, den: number): void {
  edit((d) => {
    d.timeSig = [num, den];
  });
}

export function setSwing(swing: number): void {
  edit((d) => {
    d.swing = swing;
  }, 'swing');
}

export function renameProject(name: string): void {
  edit((d) => {
    d.name = name;
  });
}

// ---------------------------------------------------------------- channels

function freeInsert(d: Project): number {
  const used = new Set(d.channels.map((c) => c.mixerTrack));
  for (let i = 1; i < d.mixer.length; i++) if (!used.has(i) && d.mixer[i].effects.length === 0) return i;
  return 0;
}

export function addChannel(ch: Channel): void {
  edit((d) => {
    const insert = freeInsert(d);
    ch.mixerTrack = insert;
    ch.color = paletteColor(d.channels.length);
    if (insert > 0) {
      d.mixer[insert].name = ch.name;
      d.mixer[insert].color = ch.color;
    }
    d.channels.push(ch);
  });
  patchUi({ selectedChannelId: ch.id });
  engine.setLiveChannel(ch.id);
}

export function removeChannel(id: ID): void {
  edit((d) => {
    d.channels = d.channels.filter((c) => c.id !== id);
    for (const p of d.patterns) delete p.notes[id];
    d.clips = d.clips.filter((c) => !(c.kind === 'automation' && c.target.scope === 'channel' && c.target.channelId === id));
  });
}

export function cloneChannel(id: ID): void {
  const src = project.get().channels.find((c) => c.id === id);
  if (!src) return;
  const copy: Channel = { ...structuredClone(src), id: uid('ch'), name: `${src.name} #2` };
  edit((d) => {
    const i = d.channels.findIndex((c) => c.id === id);
    copy.mixerTrack = freeInsert(d) || src.mixerTrack;
    if (copy.mixerTrack !== src.mixerTrack) d.mixer[copy.mixerTrack].name = copy.name;
    d.channels.splice(i + 1, 0, copy);
    for (const p of d.patterns) {
      const notes = p.notes[id];
      if (notes) p.notes[copy.id] = notes.map((n) => ({ ...n, id: uid('n') }));
    }
  });
}

export function moveChannel(id: ID, dir: -1 | 1): void {
  edit((d) => {
    const i = d.channels.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= d.channels.length) return;
    [d.channels[i], d.channels[j]] = [d.channels[j], d.channels[i]];
  });
}

export function updateChannel(id: ID, patch: Partial<Omit<Channel, 'id' | 'params'>>, coalesce?: string): void {
  edit((d) => {
    const ch = d.channels.find((c) => c.id === id);
    if (ch) Object.assign(ch, patch);
  }, coalesce);
}

export function setChannelParam(id: ID, key: string, value: ParamValue, coalesce?: string): void {
  edit((d) => {
    const ch = d.channels.find((c) => c.id === id);
    if (ch) ch.params[key] = value;
  }, coalesce);
}

export function setChannelParams(id: ID, params: Record<string, ParamValue>): void {
  edit((d) => {
    const ch = d.channels.find((c) => c.id === id);
    if (ch) Object.assign(ch.params, params);
  });
}

// ---------------------------------------------------------------- patterns

export function addPattern(): ID {
  const pat = makePattern(project.get().patterns.length);
  edit((d) => {
    d.patterns.push(pat);
  });
  patchUi({ currentPatternId: pat.id });
  return pat.id;
}

export function clonePattern(id: ID): void {
  const src = project.get().patterns.find((p) => p.id === id);
  if (!src) return;
  const copy = structuredClone(src);
  copy.id = uid('pt');
  copy.name = `${src.name} (копия)`;
  for (const k of Object.keys(copy.notes)) copy.notes[k] = copy.notes[k].map((n) => ({ ...n, id: uid('n') }));
  edit((d) => {
    d.patterns.splice(d.patterns.findIndex((p) => p.id === id) + 1, 0, copy);
  });
  patchUi({ currentPatternId: copy.id });
}

export function renamePattern(id: ID, name: string): void {
  edit((d) => {
    const p = d.patterns.find((x) => x.id === id);
    if (p) p.name = name;
  });
}

export function deletePattern(id: ID): void {
  if (project.get().patterns.length <= 1) {
    toast('Нельзя удалить последний паттерн', 'error');
    return;
  }
  edit((d) => {
    d.patterns = d.patterns.filter((p) => p.id !== id);
    d.clips = d.clips.filter((c) => !(c.kind === 'pattern' && c.patternId === id));
  });
}

export function setPatternBars(id: ID, bars: number): void {
  edit((d) => {
    const p = d.patterns.find((x) => x.id === id);
    if (p) p.bars = Math.min(64, Math.max(1, Math.round(bars)));
  });
}

export function toggleStep(patternId: ID, channelId: ID, step: number, on?: boolean): void {
  const tick = step * TICKS_PER_STEP;
  edit((d) => {
    const pat = d.patterns.find((p) => p.id === patternId);
    const ch = d.channels.find((c) => c.id === channelId);
    if (!pat || !ch) return;
    const notes = (pat.notes[channelId] ??= []);
    const idx = notes.findIndex((n) => n.start === tick);
    const isOn = idx >= 0;
    const want = on ?? !isOn;
    if (want && !isOn) notes.push(makeNote(ch.stepPitch, tick, TICKS_PER_STEP, 0.8));
    if (!want && isOn) notes.splice(idx, 1);
  }, on === undefined ? undefined : `steps-${channelId}`);
}

export function setStepVelocity(patternId: ID, channelId: ID, step: number, velocity: number): void {
  edit((d) => {
    const n = d.patterns.find((p) => p.id === patternId)?.notes[channelId]?.find((x) => x.start === step * TICKS_PER_STEP);
    if (n) n.velocity = Math.min(1, Math.max(0.02, velocity));
  }, `vel-${channelId}-${step}`);
}

export function setNotes(patternId: ID, channelId: ID, notes: Note[], coalesce?: string): void {
  edit((d) => {
    const pat = d.patterns.find((p) => p.id === patternId);
    if (pat) pat.notes[channelId] = notes;
  }, coalesce);
}

export function clearChannelNotes(patternId: ID, channelId: ID): void {
  setNotes(patternId, channelId, []);
}

/** Fill every Nth step for a channel (FL's "fill each N steps"). */
export function fillSteps(patternId: ID, channelId: ID, every: number): void {
  const p = project.get();
  const pat = p.patterns.find((x) => x.id === patternId);
  const ch = p.channels.find((c) => c.id === channelId);
  if (!pat || !ch) return;
  const steps = patternLengthTicks(pat, p.timeSig) / TICKS_PER_STEP;
  const notes: Note[] = [];
  for (let s = 0; s < steps; s += every) notes.push(makeNote(ch.stepPitch, s * TICKS_PER_STEP, TICKS_PER_STEP));
  setNotes(patternId, channelId, notes);
}

// ---------------------------------------------------------------- playlist

export function addClip(clip: Clip): void {
  edit((d) => {
    d.clips.push(clip);
  });
}

export function updateClips(updates: { id: ID; patch: Partial<Clip> }[], coalesce?: string): void {
  edit((d) => {
    for (const u of updates) {
      const c = d.clips.find((x) => x.id === u.id);
      if (c) Object.assign(c, u.patch);
    }
  }, coalesce);
}

export function deleteClips(ids: ID[]): void {
  const set = new Set(ids);
  edit((d) => {
    d.clips = d.clips.filter((c) => !set.has(c.id));
  });
  patchUi({ playlist: { ...ui.get().playlist, selection: ui.get().playlist.selection.filter((x) => !set.has(x)) } });
}

export function duplicateClips(ids: ID[]): void {
  const set = new Set(ids);
  const src = project.get().clips.filter((c) => set.has(c.id));
  if (!src.length) return;
  const start = Math.min(...src.map((c) => c.start));
  const end = Math.max(...src.map((c) => c.start + c.length));
  const copies = src.map((c) => ({ ...structuredClone(c), id: uid('cl'), start: c.start + (end - start) }));
  edit((d) => {
    d.clips.push(...copies);
  });
  patchUi({ playlist: { ...ui.get().playlist, selection: copies.map((c) => c.id) } });
}

/** Cut a clip in two at `tick` (FL's slice tool). */
export function sliceClip(id: ID, tick: number): void {
  const c = project.get().clips.find((x) => x.id === id);
  if (!c || tick <= c.start || tick >= c.start + c.length) return;
  const leftLen = tick - c.start;
  const right: Clip = { ...structuredClone(c), id: uid('cl'), start: tick, length: c.length - leftLen };
  if (right.kind === 'audio') right.offset = (c as AudioClip).offset + leftLen * secondsPerTick(project.get().bpm);
  if (right.kind === 'automation' && c.kind === 'automation') {
    right.points = c.points.filter((p) => p.t >= leftLen).map((p) => ({ ...p, t: p.t - leftLen }));
    right.points.unshift({ t: 0, v: pointValue(c.points, leftLen) });
  }
  edit((d) => {
    const orig = d.clips.find((x) => x.id === id);
    if (!orig) return;
    orig.length = leftLen;
    if (orig.kind === 'automation') {
      const end = pointValue(orig.points, leftLen);
      orig.points = orig.points.filter((p) => p.t <= leftLen);
      orig.points.push({ t: leftLen, v: end });
    }
    d.clips.push(right);
  });
}

function pointValue(points: AutomationPoint[], t: number): number {
  if (!points.length) return 0.5;
  if (t <= points[0].t) return points[0].v;
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i].t) {
      const a = points[i - 1];
      const b = points[i];
      return b.t === a.t ? b.v : a.v + ((t - a.t) / (b.t - a.t)) * (b.v - a.v);
    }
  }
  return points[points.length - 1].v;
}

export function updateTrack(id: ID, patch: { name?: string; mute?: boolean; color?: string }): void {
  edit((d) => {
    const t = d.tracks.find((x) => x.id === id);
    if (t) Object.assign(t, patch);
  });
}

export function addTrack(): void {
  edit((d) => {
    d.tracks.push({ id: uid('tr'), name: `Track ${d.tracks.length + 1}`, color: paletteColor(d.tracks.length + 4), mute: false });
  });
}

export function setLoopRegion(start: number, end: number): void {
  edit((d) => {
    d.loop = end > start ? { start, end } : null;
  }, 'loop');
}

/** Place a pattern clip on the first free track at `start`. */
export function placePattern(patternId: ID, start: number, trackId?: ID): void {
  const p = project.get();
  const pat = p.patterns.find((x) => x.id === patternId);
  if (!pat) return;
  const len = patternLengthTicks(pat, p.timeSig);
  const track = trackId ?? firstFreeTrack(p, start, start + len);
  addClip(makePatternClip(track, patternId, start, len));
}

function firstFreeTrack(p: Project, from: number, to: number): ID {
  for (const t of p.tracks) {
    if (!p.clips.some((c) => c.trackId === t.id && c.start < to && c.start + c.length > from)) return t.id;
  }
  return p.tracks[p.tracks.length - 1].id;
}

export function addAudioClip(sampleId: ID, duration: number, start: number, trackId?: ID, mixerTrack = 0): ID {
  const p = project.get();
  const length = Math.max(1, Math.round(duration / secondsPerTick(p.bpm)));
  const track = trackId ?? firstFreeTrack(p, start, start + length);
  const clip: AudioClip = { id: uid('cl'), kind: 'audio', trackId: track, start, length, sampleId, offset: 0, gain: 1, mixerTrack };
  addClip(clip);
  return clip.id;
}

// ---------------------------------------------------------------- mixer

export function updateMixerTrack(index: number, patch: Partial<Omit<MixerTrack, 'id' | 'effects'>>, coalesce?: string): void {
  edit((d) => {
    const t = d.mixer[index];
    if (t) Object.assign(t, patch);
  }, coalesce);
}

export function addEffect(index: number, type: EffectType): ID {
  const fx = makeEffect(type);
  edit((d) => {
    d.mixer[index]?.effects.push(fx);
  });
  return fx.id;
}

export function removeEffect(index: number, effectId: ID): void {
  edit((d) => {
    const t = d.mixer[index];
    if (t) t.effects = t.effects.filter((e) => e.id !== effectId);
    d.clips = d.clips.filter((c) => !(c.kind === 'automation' && c.target.scope === 'effect' && c.target.effectId === effectId));
  });
}

export function moveEffect(index: number, effectId: ID, dir: -1 | 1): void {
  edit((d) => {
    const fx = d.mixer[index]?.effects;
    if (!fx) return;
    const i = fx.findIndex((e) => e.id === effectId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= fx.length) return;
    [fx[i], fx[j]] = [fx[j], fx[i]];
  });
}

export function setEffectBypass(index: number, effectId: ID, bypass: boolean): void {
  edit((d) => {
    const e = d.mixer[index]?.effects.find((x) => x.id === effectId);
    if (e) e.bypass = bypass;
  });
}

export function setEffectParam(index: number, effectId: ID, key: string, value: ParamValue, coalesce?: string): void {
  edit((d) => {
    const e = d.mixer[index]?.effects.find((x) => x.id === effectId);
    if (e) e.params[key] = value;
  }, coalesce);
}

// ---------------------------------------------------------------- automation

/** FL's "Create automation clip": a flat clip at the current value, spanning the song. */
export function createAutomationClip(target: AutomationTarget): ID {
  const p = project.get();
  const bar = ticksPerBar(p.timeSig);
  const length = Math.max(4 * bar, songLengthTicks(p));
  const value = targetNormalizedValue(p, target);
  const name = targetLabel(p, target);
  const track = firstFreeTrack(p, 0, length);
  const clip = makeAutomationClip(track, target, name, 0, length, value);
  addClip(clip);
  toast(`Клип автоматизации «${name}» добавлен в плейлист`, 'success');
  return clip.id;
}

export function setAutomationPoints(clipId: ID, points: AutomationPoint[], coalesce?: string): void {
  edit((d) => {
    const c = d.clips.find((x) => x.id === clipId);
    if (c?.kind === 'automation') c.points = points;
  }, coalesce);
}

// ---------------------------------------------------------------- samples

export function registerSample(id: ID, name: string, duration: number): void {
  edit((d) => {
    if (!d.samples.some((s) => s.id === id)) d.samples.push({ id, name, duration });
  });
}
