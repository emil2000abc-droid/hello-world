import { motion } from 'motion/react';
import { useState } from 'react';
import { PLANETS, formatDay, formatNumber, formatYear, type Planet, type PlanetClass } from '../data/planets';
import { scene } from '../state/store';
import { usePortrait } from '../three/portraits';
import { ArrowUpRight } from './Icons';
import { Reveal, SectionHeading } from './Reveal';

const EASE = [0.16, 1, 0.3, 1] as const;

export function PlanetImage({ planet, className, shared = true }: { planet: Planet; className?: string; shared?: boolean }) {
  const src = usePortrait(planet.id);
  return (
    <motion.div layoutId={shared ? `planet-visual-${planet.id}` : undefined} className={`relative aspect-square ${className ?? ''}`}>
      {src ? (
        <img src={src} alt={`Rendered view of ${planet.name}`} className="h-full w-full object-contain" draggable={false} />
      ) : (
        <div className="absolute inset-[22%] animate-pulse rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, ${planet.color}, #050505 70%)` }} aria-hidden="true" />
      )}
    </motion.div>
  );
}

function PlanetCard({ planet, i }: { planet: Planet; i: number }) {
  const open = () => scene.set({ modal: planet.id, modalFromCard: true });
  return (
    <Reveal delay={(i % 4) * 0.07}>
      <motion.article
        layout
        onClick={open}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
        tabIndex={0}
        role="button"
        aria-label={`${planet.name}: open the full profile`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
          e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
        }}
        whileHover={{ y: -6 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="group glass relative flex h-full cursor-pointer flex-col overflow-hidden rounded-[28px] p-5 transition-[border-color] duration-500 hover:border-lime/40 focus-visible:rounded-[28px]"
      >
        <div className="spotlight pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
        <div className="relative flex items-start justify-between">
          <span className="font-mono text-[11px] tracking-[0.18em] text-dim">
            <span className="text-mist transition-colors group-hover:text-lime">{String(planet.index).padStart(2, '0')}</span> · {planet.kind}
          </span>
          <span className="grid h-8 w-8 place-items-center rounded-full border border-white/10 text-mist transition-all duration-500 group-hover:rotate-45 group-hover:border-lime group-hover:bg-lime group-hover:text-black">
            <ArrowUpRight size={14} />
          </span>
        </div>
        <div className="relative mx-auto my-4 w-[78%] transition-transform duration-[1.2s] ease-[cubic-bezier(.16,1,.3,1)] group-hover:scale-[1.06]">
          <div className="absolute inset-[18%] rounded-full opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-60" style={{ background: planet.color }} aria-hidden="true" />
          <PlanetImage planet={planet} />
        </div>
        <h3 className="relative text-2xl font-medium tracking-[-0.03em]">{planet.name}</h3>
        <p className="relative mt-2 text-sm leading-relaxed text-mist">{planet.summary}</p>
        <dl className="relative mt-auto grid grid-cols-3 gap-2 border-t border-white/[0.07] pt-4">
          {[
            ['Diameter', `${formatNumber(planet.diameterKm / 1000, 1)}k km`],
            ['Day', formatDay(planet.dayHours).replace(' (retrograde)', '')],
            ['Year', formatYear(planet.yearDays)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="font-mono text-[9.5px] tracking-[0.16em] text-dim uppercase">{k}</dt>
              <dd className="tabular mt-1 text-[13px]">{v}</dd>
            </div>
          ))}
        </dl>
      </motion.article>
    </Reveal>
  );
}

const FILTERS: ('All' | PlanetClass)[] = ['All', 'Terrestrial', 'Gas giant', 'Ice giant'];

export function PlanetsSection() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const list = PLANETS.filter((p) => filter === 'All' || p.kind === filter);
  return (
    <section id="planets" className="relative mx-auto max-w-[1440px] scroll-mt-20 px-5 pt-28 pb-24 md:px-8 md:pt-40">
      <SectionHeading
        eyebrow="The planets"
        title={
          <>
            Eight worlds,
            <br />
            <span className="text-mist">eight personalities.</span>
          </>
        }
        intro="From a scorched iron world to a blue giant swept by supersonic winds. Open any planet for its full profile and a live 3D view."
        aside={
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter planets">
            {FILTERS.map((f) => (
              <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f}
                <span className="font-mono text-[10px] opacity-70">{f === 'All' ? 8 : PLANETS.filter((p) => p.kind === f).length}</span>
              </button>
            ))}
          </div>
        }
      />
      <motion.div layout className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {list.map((p, i) => (
          <PlanetCard key={p.id} planet={p} i={i} />
        ))}
      </motion.div>
    </section>
  );
}
