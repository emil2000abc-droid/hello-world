// Turns collected events for a tick range into scheduled audio on a graph.
// The realtime transport calls this every few milliseconds; the offline
// renderer calls it for the whole song.

import { targetSpec } from '../core/automation';
import { fromNormalized, instrumentSpecs } from '../core/params';
import type { ID, ParamMap, Project, TransportMode } from '../core/types';
import {
  activeAutomation,
  automationAt,
  automationValue,
  collectAudioCovering,
  collectAudioStarts,
  collectNotes,
  targetKey,
  type AudioEvent,
} from './events';
import type { ProjectGraph } from './graph';

export interface ScheduleRange {
  project: Project;
  mode: TransportMode;
  patternId: ID | null;
  from: number;
  to: number;
  /** Context time of tick `from`. */
  time: number;
  /** Seconds per tick. */
  spt: number;
}

export interface SequencerHooks {
  /** Audio clip sample lookup. */
  sample(id: ID): AudioBuffer | undefined;
  /** Called for each started audio clip source so it can be stopped later. */
  onSource?(src: AudioBufferSourceNode): void;
  /** Called for each automation target touched, so it can be restored later. */
  onAutomated?(key: string): void;
}

/** Instrument params with no AudioParam: automation is sampled at note-on. */
function noteOverrides(project: Project, channelId: ID, type: Project['channels'][number]['type'], tick: number, graph: ProjectGraph): ParamMap | undefined {
  let out: ParamMap | undefined;
  for (const c of project.clips) {
    if (c.kind !== 'automation' || c.target.scope !== 'channel' || c.target.channelId !== channelId) continue;
    const param = c.target.param;
    if (param === 'volume' || param === 'pan') continue;
    if (graph.resolveTarget(c.target)) continue;
    const spec = instrumentSpecs(type).find((s) => s.key === param);
    if (!spec || spec.kind !== 'number') continue;
    const v = automationAt(project, targetKey(c.target), tick);
    if (v === null) continue;
    (out ??= {})[param] = fromNormalized(spec, v);
  }
  return out;
}

export function scheduleRange(graph: ProjectGraph, r: ScheduleRange, hooks: SequencerHooks): void {
  const { project, from, to, time, spt } = r;
  const at = (tick: number) => time + (tick - from) * spt;
  const channels = new Map(project.channels.map((c) => [c.id, c]));
  const hasAutomation = r.mode === 'song' && project.clips.some((c) => c.kind === 'automation');

  for (const ev of collectNotes(project, r.mode, r.patternId, from, to)) {
    const ch = channels.get(ev.channelId);
    const strip = graph.channels.get(ev.channelId);
    if (!ch || !strip || ch.mute) continue;
    const overrides = hasAutomation ? noteOverrides(project, ch.id, ch.type, ev.tick, graph) : undefined;
    const when = at(ev.tick);
    const voice = strip.instrument.play(ev.pitch, ev.velocity, when, ev.length * spt, overrides);
    graph.choke(strip.instrument.chokeGroup(), voice, when);
  }

  if (r.mode === 'song') {
    for (const ev of collectAudioStarts(project, from, to)) startAudio(graph, ev, at(ev.tick), spt, hooks);
    scheduleAutomation(graph, r, hooks);
  }
}

/** Start audio clips already in progress at `tick` (play from the middle, loop wrap). */
export function startCoveringAudio(graph: ProjectGraph, project: Project, tick: number, time: number, spt: number, hooks: SequencerHooks): void {
  for (const ev of collectAudioCovering(project, tick)) startAudio(graph, ev, time, spt, hooks);
}

function startAudio(graph: ProjectGraph, ev: AudioEvent, when: number, spt: number, hooks: SequencerHooks): void {
  const buf = hooks.sample(ev.clip.sampleId);
  if (!buf) return;
  const strip = graph.strips[Math.min(ev.clip.mixerTrack, graph.strips.length - 1)];
  if (!strip) return;
  const offset = ev.clip.offset + ev.intoClip * spt;
  if (offset >= buf.duration) return;
  const remaining = (ev.clip.length - ev.intoClip) * spt;
  const src = graph.ctx.createBufferSource();
  src.buffer = buf;
  const g = graph.ctx.createGain();
  g.gain.value = ev.clip.gain;
  src.connect(g).connect(strip.input);
  src.start(when, offset, Math.min(remaining, buf.duration - offset));
  src.addEventListener('ended', () => {
    src.disconnect();
    g.disconnect();
  });
  hooks.onSource?.(src);
}

function scheduleAutomation(graph: ProjectGraph, r: ScheduleRange, hooks: SequencerHooks): void {
  const { project, from, to, time, spt } = r;
  for (const clip of activeAutomation(project, from, to)) {
    const target = graph.resolveTarget(clip.target);
    const spec = targetSpec(project, clip.target);
    if (!target || !spec) continue;
    const a = Math.max(from, clip.start);
    const b = Math.min(to, clip.start + clip.length);
    const ta = time + (a - from) * spt;
    const tb = time + (b - from) * spt;
    const va = target.map(fromNormalized(spec, automationValue(clip, a - clip.start)));
    const vb = target.map(fromNormalized(spec, automationValue(clip, b - clip.start)));
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    // No cancel here: the previous chunk's ramp ends exactly at `ta`.
    target.param.setValueAtTime(va, ta);
    target.param.linearRampToValueAtTime(vb, tb);
    hooks.onAutomated?.(targetKey(clip.target));
  }
}

/** Set every automated parameter to its value at `tick` (used when playback starts mid-song). */
export function primeAutomation(graph: ProjectGraph, project: Project, tick: number, time: number, hooks: SequencerHooks): void {
  for (const clip of project.clips) {
    if (clip.kind !== 'automation') continue;
    const v = automationAt(project, targetKey(clip.target), tick);
    if (v === null) continue;
    const target = graph.resolveTarget(clip.target);
    const spec = targetSpec(project, clip.target);
    if (!target || !spec) continue;
    target.param.cancelScheduledValues(time);
    target.param.setValueAtTime(target.map(fromNormalized(spec, v)), time);
    hooks.onAutomated?.(targetKey(clip.target));
  }
}
