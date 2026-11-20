// Pure event collection: given a project and a tick range, decide what plays.
// Shared by the realtime transport and the offline (export) renderer.

import { patternLengthTicks } from '../core/music';
import {
  TICKS_PER_STEP,
  type AudioClip,
  type AutomationClip,
  type AutomationTarget,
  type ID,
  type Pattern,
  type Project,
  type TransportMode,
} from '../core/types';

export interface NoteEvent {
  channelId: ID;
  pitch: number;
  velocity: number;
  /** Absolute timeline tick, swing applied (may be fractional). */
  tick: number;
  /** Length in ticks. */
  length: number;
}

export interface AudioEvent {
  clip: AudioClip;
  /** Timeline tick at which playback starts. */
  tick: number;
  /** Ticks into the clip at which playback starts (non-zero when starting mid-clip). */
  intoClip: number;
}

/** Maximum swing shift, as a fraction of a step. */
const SWING_MAX = 0.6;

export function swingOffset(patternTick: number, swing: number): number {
  if (swing <= 0) return 0;
  return patternTick % (TICKS_PER_STEP * 2) === TICKS_PER_STEP ? swing * SWING_MAX * TICKS_PER_STEP : 0;
}

function pushPatternNotes(
  out: NoteEvent[],
  pattern: Pattern,
  patLen: number,
  origin: number,
  regionEnd: number,
  from: number,
  to: number,
  swing: number,
): void {
  if (patLen <= 0) return;
  const lo = Math.max(from, origin);
  const hi = Math.min(to, regionEnd);
  if (hi <= lo) return;
  const firstRep = Math.floor((lo - origin) / patLen);
  const lastRep = Math.floor((hi - 1 - origin) / patLen);
  for (const [channelId, notes] of Object.entries(pattern.notes)) {
    for (let rep = firstRep; rep <= lastRep; rep++) {
      const base = origin + rep * patLen;
      for (const n of notes) {
        if (n.start >= patLen) continue;
        const t = base + n.start;
        if (t < lo || t >= hi) continue;
        const length = Math.max(1, Math.min(n.length, regionEnd - t));
        out.push({ channelId, pitch: n.pitch, velocity: n.velocity, tick: t + swingOffset(n.start, swing), length });
      }
    }
  }
}

/** Notes whose (unswung) start lies in [from, to). */
export function collectNotes(
  project: Project,
  mode: TransportMode,
  patternId: ID | null,
  from: number,
  to: number,
): NoteEvent[] {
  const out: NoteEvent[] = [];
  if (mode === 'pattern') {
    const pattern = project.patterns.find((p) => p.id === patternId);
    if (!pattern) return out;
    const len = patternLengthTicks(pattern, project.timeSig);
    pushPatternNotes(out, pattern, len, 0, Number.POSITIVE_INFINITY, from, to, project.swing);
  } else {
    const muted = mutedTracks(project);
    const byId = new Map(project.patterns.map((p) => [p.id, p]));
    for (const clip of project.clips) {
      if (clip.kind !== 'pattern' || muted.has(clip.trackId)) continue;
      if (clip.start >= to || clip.start + clip.length <= from) continue;
      const pattern = byId.get(clip.patternId);
      if (!pattern) continue;
      const len = patternLengthTicks(pattern, project.timeSig);
      pushPatternNotes(out, pattern, len, clip.start, clip.start + clip.length, from, to, project.swing);
    }
  }
  out.sort((a, b) => a.tick - b.tick);
  return out;
}

function mutedTracks(project: Project): Set<ID> {
  return new Set(project.tracks.filter((t) => t.mute).map((t) => t.id));
}

/** Audio clips that start inside [from, to). */
export function collectAudioStarts(project: Project, from: number, to: number): AudioEvent[] {
  const muted = mutedTracks(project);
  const out: AudioEvent[] = [];
  for (const clip of project.clips) {
    if (clip.kind !== 'audio' || muted.has(clip.trackId)) continue;
    if (clip.start >= from && clip.start < to) out.push({ clip, tick: clip.start, intoClip: 0 });
  }
  return out;
}

/** Audio clips already sounding at `tick` (strictly after their start). */
export function collectAudioCovering(project: Project, tick: number): AudioEvent[] {
  const muted = mutedTracks(project);
  const out: AudioEvent[] = [];
  for (const clip of project.clips) {
    if (clip.kind !== 'audio' || muted.has(clip.trackId)) continue;
    if (clip.start < tick && clip.start + clip.length > tick) out.push({ clip, tick, intoClip: tick - clip.start });
  }
  return out;
}

export function targetKey(t: AutomationTarget): string {
  switch (t.scope) {
    case 'channel':
      return `ch:${t.channelId}:${t.param}`;
    case 'mixer':
      return `mx:${t.trackIndex}:${t.param}`;
    case 'effect':
      return `fx:${t.trackIndex}:${t.effectId}:${t.param}`;
  }
}

/** Linear interpolation over the clip's points; `local` is ticks from clip start. */
export function automationValue(clip: AutomationClip, local: number): number {
  const pts = clip.points;
  if (pts.length === 0) return 0;
  if (local <= pts[0].t) return pts[0].v;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (local <= b.t) {
      if (b.t === a.t) return b.v;
      return a.v + ((local - a.t) / (b.t - a.t)) * (b.v - a.v);
    }
  }
  return pts[pts.length - 1].v;
}

/** Automation clips (unmuted) that overlap [from, to). */
export function activeAutomation(project: Project, from: number, to: number): AutomationClip[] {
  const muted = mutedTracks(project);
  return project.clips.filter(
    (c): c is AutomationClip =>
      c.kind === 'automation' && !muted.has(c.trackId) && c.start < to && c.start + c.length > from,
  );
}

/** Normalised automation value for a target at `tick`, or null when no clip covers it. */
export function automationAt(project: Project, key: string, tick: number): number | null {
  const muted = mutedTracks(project);
  for (const c of project.clips) {
    if (c.kind !== 'automation' || muted.has(c.trackId) || targetKey(c.target) !== key) continue;
    if (tick >= c.start && tick < c.start + c.length) return automationValue(c, tick - c.start);
  }
  return null;
}
