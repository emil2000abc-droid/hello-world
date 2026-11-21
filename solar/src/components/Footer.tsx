import { NAV_SECTIONS } from '../hooks/dom';
import { scene, scrollToId } from '../state/store';
import { startExploring } from './Header';
import { ArrowUpRight, LogoMark } from './Icons';
import { Reveal } from './Reveal';

const MORE = [
  { id: 'sun', label: 'The Sun' },
  { id: 'data', label: 'Planetary data' },
];

export function Footer() {
  return (
    <footer className="relative mt-16 border-t border-white/[0.07]">
      <div className="mx-auto max-w-[1440px] px-5 pt-20 pb-10 md:px-8">
        <Reveal>
          <div className="flex flex-col justify-between gap-10 md:flex-row md:items-end">
            <div>
              <span className="eyebrow">Ready for launch</span>
              <p className="display mt-5 max-w-[640px] text-[clamp(2.2rem,5vw,4.2rem)]">
                The view is better
                <br />
                <span className="text-mist">from up here.</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button className="btn-lime" onClick={startExploring}>
                Explore the system
                <span className="btn-icon">
                  <ArrowUpRight size={14} />
                </span>
              </button>
              <button className="btn-ghost" onClick={() => (scrollToId('overview'), scene.set({ cinematic: true }))}>
                Watch Universe
              </button>
            </div>
          </div>
        </Reveal>

        <div className="mt-20 grid gap-10 border-t border-white/[0.07] pt-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <LogoMark />
              <span className="text-[15px] font-semibold tracking-[0.32em]">SOLAR</span>
            </div>
            <p className="mt-4 max-w-[300px] text-sm leading-relaxed text-mist">An interactive field guide to the eight planets and the star they orbit.</p>
          </div>
          <nav aria-label="Footer">
            <div className="font-mono text-[10px] tracking-[0.18em] text-dim uppercase">Explore</div>
            <ul className="mt-4 space-y-2.5 text-sm">
              {[...NAV_SECTIONS, ...MORE].map((s) => (
                <li key={s.id}>
                  <button onClick={() => scrollToId(s.id)} className="text-mist transition-colors hover:text-lime">
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <div className="font-mono text-[10px] tracking-[0.18em] text-dim uppercase">Sources</div>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <a className="inline-flex items-center gap-1.5 text-mist transition-colors hover:text-lime" href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/" target="_blank" rel="noreferrer">
                  NASA Planetary Fact Sheet <ArrowUpRight size={12} />
                </a>
              </li>
              <li>
                <a className="inline-flex items-center gap-1.5 text-mist transition-colors hover:text-lime" href="https://science.nasa.gov/solar-system/" target="_blank" rel="noreferrer">
                  NASA Solar System <ArrowUpRight size={12} />
                </a>
              </li>
              <li>
                <a className="inline-flex items-center gap-1.5 text-mist transition-colors hover:text-lime" href="https://www.esa.int/Science_Exploration/Space_Science" target="_blank" rel="noreferrer">
                  ESA Space Science <ArrowUpRight size={12} />
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="font-mono text-[10px] tracking-[0.18em] text-dim uppercase">About the model</div>
            <p className="mt-4 text-sm leading-relaxed text-mist">Planets are rendered live in WebGL. Sizes and distances are compressed so all eight worlds fit on one screen; orbital speeds keep their real order.</p>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-white/[0.07] pt-6 font-mono text-[10px] tracking-[0.14em] text-dim uppercase sm:flex-row sm:items-center">
          <span>© {new Date().getFullYear()} SOLAR · Educational project</span>
          <button onClick={() => scrollToId('overview')} className="inline-flex items-center gap-2 transition-colors hover:text-lime">
            Back to top <ArrowUpRight size={12} className="-rotate-45" />
          </button>
        </div>
      </div>
      <div className="pointer-events-none overflow-hidden select-none" aria-hidden="true">
        <div className="display translate-y-[18%] text-center text-[26vw] leading-none font-semibold text-transparent [-webkit-text-stroke:1px_rgba(255,255,255,0.08)]">SOLAR</div>
      </div>
    </footer>
  );
}
