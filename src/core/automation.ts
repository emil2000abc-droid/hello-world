// Helpers describing automation targets: their parameter spec, a readable
// label, and the project's current (non-automated) value.

import { CHANNEL_PAN_SPEC, CHANNEL_VOLUME_SPEC, EFFECT_DEFS, instrumentSpecs, toNormalized, type NumberParamSpec } from './params';
import type { AutomationTarget, Project } from './types';

export function targetSpec(project: Project, t: AutomationTarget): NumberParamSpec | null {
  if (t.param === 'volume' && t.scope !== 'effect') return CHANNEL_VOLUME_SPEC;
  if (t.param === 'pan' && t.scope !== 'effect') return CHANNEL_PAN_SPEC;
  if (t.scope === 'channel') {
    const ch = project.channels.find((c) => c.id === t.channelId);
    const spec = ch ? instrumentSpecs(ch.type).find((s) => s.key === t.param) : undefined;
    return spec?.kind === 'number' ? spec : null;
  }
  if (t.scope === 'effect') {
    const slot = project.mixer[t.trackIndex]?.effects.find((e) => e.id === t.effectId);
    const spec = slot ? EFFECT_DEFS[slot.type].params.find((s) => s.key === t.param) : undefined;
    return spec?.kind === 'number' ? spec : null;
  }
  return null;
}

export function targetLabel(project: Project, t: AutomationTarget): string {
  const spec = targetSpec(project, t);
  const param = spec?.label ?? t.param;
  if (t.scope === 'channel') {
    const ch = project.channels.find((c) => c.id === t.channelId);
    return `${ch?.name ?? 'Channel'} — ${param}`;
  }
  const track = project.mixer[t.trackIndex];
  const trackName = t.trackIndex === 0 ? 'Master' : track?.name ?? `Insert ${t.trackIndex}`;
  if (t.scope === 'mixer') return `${trackName} — ${param}`;
  const slot = track?.effects.find((e) => e.id === t.effectId);
  return `${trackName} — ${slot ? EFFECT_DEFS[slot.type].name : 'FX'} — ${param}`;
}

/** Current project value of the target, normalised 0..1. */
export function targetNormalizedValue(project: Project, t: AutomationTarget): number {
  const spec = targetSpec(project, t);
  if (!spec) return 0.5;
  let raw: unknown;
  if (t.scope === 'channel') {
    const ch = project.channels.find((c) => c.id === t.channelId);
    raw = t.param === 'volume' ? ch?.volume : t.param === 'pan' ? ch?.pan : ch?.params[t.param];
  } else if (t.scope === 'mixer') {
    const tr = project.mixer[t.trackIndex];
    raw = t.param === 'volume' ? tr?.volume : tr?.pan;
  } else {
    raw = project.mixer[t.trackIndex]?.effects.find((e) => e.id === t.effectId)?.params[t.param];
  }
  return typeof raw === 'number' ? toNormalized(spec, raw) : 0.5;
}

/** Whether a clip's target still exists (channels/effects can be deleted). */
export function targetExists(project: Project, t: AutomationTarget): boolean {
  if (t.scope === 'channel') return project.channels.some((c) => c.id === t.channelId);
  if (t.scope === 'mixer') return t.trackIndex < project.mixer.length;
  return !!project.mixer[t.trackIndex]?.effects.some((e) => e.id === t.effectId);
}
