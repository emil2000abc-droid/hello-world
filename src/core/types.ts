// Project data model. Everything here is plain serialisable data: the audio
// engine and the UI both read it, but neither owns it.

/** Ticks per quarter note. All musical positions and lengths are in ticks. */
export const PPQ = 96;
/** One 1/16 step of the step sequencer. */
export const TICKS_PER_STEP = PPQ / 4;

export type ID = string;
export type ParamValue = number | string | boolean;
export type ParamMap = Record<string, ParamValue>;

export interface Note {
  id: ID;
  /** MIDI pitch, 0..127 (60 = C5 in FL naming, C4 in scientific naming). */
  pitch: number;
  /** Ticks from the start of the pattern. */
  start: number;
  /** Length in ticks. */
  length: number;
  /** 0..1 */
  velocity: number;
}

export type InstrumentType = 'synth' | 'drum' | 'sampler';

export interface Channel {
  id: ID;
  name: string;
  color: string;
  type: InstrumentType;
  params: ParamMap;
  /** Linear gain, 0..1.25 */
  volume: number;
  /** -1..1 */
  pan: number;
  mute: boolean;
  /** Mixer insert index; 0 is the master track. */
  mixerTrack: number;
  /** Pitch written by the step sequencer. */
  stepPitch: number;
}

export interface Pattern {
  id: ID;
  name: string;
  color: string;
  /** Length in bars. */
  bars: number;
  /** Notes per channel id. */
  notes: Record<ID, Note[]>;
}

export interface PlaylistTrack {
  id: ID;
  name: string;
  color: string;
  mute: boolean;
}

interface ClipBase {
  id: ID;
  trackId: ID;
  /** Absolute position in ticks. */
  start: number;
  /** Length in ticks. */
  length: number;
}

export interface PatternClip extends ClipBase {
  kind: 'pattern';
  patternId: ID;
}

export interface AudioClip extends ClipBase {
  kind: 'audio';
  sampleId: ID;
  /** Seconds into the sample where playback begins. */
  offset: number;
  /** Linear gain. */
  gain: number;
  /** Mixer insert this clip plays through. */
  mixerTrack: number;
}

export interface AutomationPoint {
  /** Ticks relative to the clip start. */
  t: number;
  /** Normalised value 0..1. */
  v: number;
}

export type AutomationTarget =
  | { scope: 'channel'; channelId: ID; param: string }
  | { scope: 'mixer'; trackIndex: number; param: 'volume' | 'pan' }
  | { scope: 'effect'; trackIndex: number; effectId: ID; param: string };

export interface AutomationClip extends ClipBase {
  kind: 'automation';
  name: string;
  target: AutomationTarget;
  points: AutomationPoint[];
}

export type Clip = PatternClip | AudioClip | AutomationClip;

export type EffectType =
  | 'eq3'
  | 'filter'
  | 'compressor'
  | 'limiter'
  | 'delay'
  | 'reverb'
  | 'distortion'
  | 'chorus'
  | 'lofi';

export interface EffectSlot {
  id: ID;
  type: EffectType;
  bypass: boolean;
  params: ParamMap;
}

export interface MixerTrack {
  id: ID;
  name: string;
  color: string;
  /** Linear gain, 0..1.25 */
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  effects: EffectSlot[];
}

export interface SampleRef {
  id: ID;
  name: string;
  duration: number;
}

export interface LoopRegion {
  start: number;
  end: number;
}

export interface Project {
  version: 1;
  id: ID;
  name: string;
  bpm: number;
  timeSig: [number, number];
  /** 0..1, delays every second 1/16 step. */
  swing: number;
  channels: Channel[];
  patterns: Pattern[];
  tracks: PlaylistTrack[];
  clips: Clip[];
  /** Index 0 is the master track. */
  mixer: MixerTrack[];
  /** User samples referenced by this project (audio data lives in IndexedDB). */
  samples: SampleRef[];
  loop: LoopRegion | null;
  createdAt: number;
  updatedAt: number;
}

export type TransportMode = 'pattern' | 'song';
