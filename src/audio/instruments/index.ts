import type { InstrumentType } from '../../core/types';
import type { Instrument } from './common';
import { DrumInstrument } from './drums';
import { SamplerInstrument, type SampleLookup } from './sampler';
import { SynthInstrument } from './synth';

export type { Instrument, Voice, ParamTarget } from './common';
export type { SampleLookup } from './sampler';

export function createInstrument(ctx: BaseAudioContext, type: InstrumentType, lookup: SampleLookup): Instrument {
  switch (type) {
    case 'synth':
      return new SynthInstrument(ctx);
    case 'drum':
      return new DrumInstrument(ctx);
    case 'sampler':
      return new SamplerInstrument(ctx, lookup);
  }
}
