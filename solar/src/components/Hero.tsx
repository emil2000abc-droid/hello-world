import { AnimatePresence, motion, useScroll, useTransform } from 'motion/react';
import { useEffect, useRef } from 'react';
import { PLANETS, PLANET_BY_ID, formatDay, formatNumber, formatYear, neighbour, type PlanetId } from '../data/planets';
import { useInView, useMediaQuery } from '../hooks/dom';
import { resetView, scene, scrollToId, selectPlanet, useScene } from '../state/store';
import { SolarCanvas } from '../three/SolarScene';
import { ArrowDown, ArrowUpRight, ChevronLeft, ChevronRight, Close, Label, Minus, Pause, Play, Plus, Target } from './Icons';

const EASE = [0.16, 1, 0.3, 1] as const;
const SPEEDS = [1, 5, 20];

function HeadingLine({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <span className="block overflow-hidden pb-[0.08em]">
      <motion.span className="block" initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ duration: 1.2, ease: EASE, delay }}>
        {children}
      </motion.span>
    </span>
  );
}

function PlanetPanel({ id }: { id: PlanetId }) {
  const p = PLANET_BY_ID[id];
  const stats = [
    { k: 'Diameter', v: `${formatNumber(p.diameterKm)} km` },
    { k: 'Day', v: formatDay(p.dayHours).replace(' (retrograde)', ' ↺') },
    { k: 'Year', v: formatYear(p.yearDays) },
    { k: 'Moons', v: String(p.moons) },
  ];
  return (
    <motion.aside
      key="panel"
      initial={{ opacity: 0, x: 40, filter: 'blur(8px)' }}
      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, x: 40, filter: 'blur(8px)' }}
      transition={{ duration: 0.7, ease: EASE }}
      className="glass pointer-events-auto w-full rounded-3xl p-4 md:w-[340px] md:p-6"
      aria-live="polite"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] tracking-[0.18em] text-mist">
          <span className="text-lime">{String(p.index).padStart(2, '0')}</span> / 08 · {p.kind.toUpperCase()}
        </span>
        <button className="icon-button !h-8 !w-8" onClick={() => resetView()} aria-label="Back to the whole system">
          <Close size={14} />
        </button>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.4, ease: EASE }}>
          <h2 className="display mt-3 text-4xl md:mt-4 md:text-5xl">{p.name}</h2>
          <p className="mt-2 text-sm text-mist">{p.tagline}</p>
          <dl className="mt-4 grid grid-cols-4 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] md:mt-5 md:grid-cols-2">
            {stats.map((s) => (
              <div key={s.k} className="bg-[#08090a]/90 px-2.5 py-2.5 md:px-3.5 md:py-3">
                <dt className="font-mono text-[10px] tracking-[0.16em] text-dim uppercase">{s.k}</dt>
                <dd className="tabular mt-1 text-[12px] md:text-[15px]">{s.v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 hidden text-sm leading-relaxed text-mist md:block">{p.summary}</p>
        </motion.div>
      </AnimatePresence>
      <div className="mt-4 flex items-center gap-2 md:mt-5">
        <button className="icon-button" onClick={() => selectPlanet(neighbour(id, -1))} aria-label={`Previous: ${PLANET_BY_ID[neighbour(id, -1)].name}`}>
          <ChevronLeft />
        </button>
        <button className="icon-button" onClick={() => selectPlanet(neighbour(id, 1))} aria-label={`Next: ${PLANET_BY_ID[neighbour(id, 1)].name}`}>
          <ChevronRight />
        </button>
        <button className="btn-lime ml-auto !h-10" onClick={() => scene.set({ modal: id, modalFromCard: false })}>
          Full profile
          <span className="btn-icon !h-7 !w-7">
            <ArrowUpRight size={14} />
          </span>
        </button>
      </div>
    </motion.aside>
  );
}

function SceneControls() {
  const speed = useScene((s) => s.speed);
  const labels = useScene((s) => s.labels);
  const zoom = useScene((s) => s.zoom);
  const selected = useScene((s) => s.selected);
  const lastSpeed = useRef(1);
  return (
    <div className="glass pointer-events-auto flex items-center gap-1 rounded-full p-1.5" role="toolbar" aria-label="Simulation controls">
      <button
        className="icon-button !h-9 !w-9"
        onClick={() => {
          if (speed > 0) {
            lastSpeed.current = speed;
            scene.set({ speed: 0 });
          } else scene.set({ speed: lastSpeed.current });
        }}
        aria-label={speed > 0 ? 'Pause orbits' : 'Resume orbits'}
      >
        {speed > 0 ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="mx-1 flex items-center rounded-full border border-white/[0.08] p-0.5" role="group" aria-label="Orbital speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => scene.set({ speed: s })}
            className={`tabular h-8 rounded-full px-2.5 font-mono text-[11px] transition-colors ${speed === s ? 'bg-lime text-black' : 'text-mist hover:text-ink'}`}
            aria-pressed={speed === s}
          >
            {s}×
          </button>
        ))}
      </div>
      <button className="icon-button !h-9 !w-9" onClick={() => scene.set({ labels: !labels })} aria-pressed={labels} aria-label="Show planet labels">
        <Label size={15} />
      </button>
      <button className="icon-button !h-9 !w-9" onClick={() => scene.set({ zoom: Math.min(1.8, zoom * 1.25) })} disabled={zoom >= 1.8} aria-label="Zoom out">
        <Minus size={15} />
      </button>
      <button className="icon-button !h-9 !w-9" onClick={() => scene.set({ zoom: Math.max(0.45, zoom / 1.25) })} disabled={zoom <= 0.46} aria-label="Zoom in">
        <Plus size={15} />
      </button>
      <button className="icon-button !h-9 !w-9" onClick={() => resetView()} disabled={!selected && zoom === 1} aria-label="Reset view">
        <Target size={15} />
      </button>
    </div>
  );
}

function PlanetRail() {
  const selected = useScene((s) => s.selected);
  const hovered = useScene((s) => s.hovered);
  return (
    <div className="pointer-events-auto flex gap-1 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Fly to a planet">
      {PLANETS.map((p) => {
        const on = selected === p.id || hovered === p.id;
        return (
          <button
            key={p.id}
            onClick={() => selectPlanet(p.id)}
            onMouseEnter={() => scene.set({ hovered: p.id })}
            onMouseLeave={() => scene.get().hovered === p.id && scene.set({ hovered: null })}
            className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors duration-300 ${
              selected === p.id ? 'border-lime bg-lime text-black' : on ? 'border-lime/50 text-lime' : 'border-white/10 text-mist hover:text-ink'
            }`}
            aria-pressed={selected === p.id}
          >
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

/** Watch Universe: hide the interface and tour the planets one by one. */
function useCinematicTour() {
  const cinematic = useScene((s) => s.cinematic);
  useEffect(() => {
    if (!cinematic) return;
    const order: (PlanetId | null)[] = [null, ...PLANETS.map((p) => p.id), null];
    let i = 0;
    selectPlanet(null);
    const timer = window.setInterval(() => {
      i = (i + 1) % order.length;
      selectPlanet(order[i]);
    }, 6500);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && scene.set({ cinematic: false });
    window.addEventListener('keydown', esc);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('keydown', esc);
      resetView();
    };
  }, [cinematic]);
}

export function Hero() {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref);
  const finePointer = useMediaQuery('(pointer: fine)');
  const selected = useScene((s) => s.selected);
  const cinematic = useScene((s) => s.cinematic);
  const modal = useScene((s) => s.modal);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -120]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0]);
  useCinematicTour();

  // Arrow keys switch planets, Esc returns to the overview.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = scene.get();
      if (!st.selected || st.modal || st.cinematic || !inView) return;
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight') selectPlanet(neighbour(st.selected, 1));
      else if (e.key === 'ArrowLeft') selectPlanet(neighbour(st.selected, -1));
      else if (e.key === 'Escape') resetView();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inView]);

  const showCopy = !selected && !cinematic;
  const tourPlanet = cinematic && selected ? PLANET_BY_ID[selected] : null;

  return (
    <section id="overview" ref={ref} className="relative h-[100svh] min-h-[640px] overflow-hidden" aria-label="Interactive model of the Solar System">
      <motion.div className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.6, ease: 'easeOut' }}>
        <SolarCanvas active={inView && !modal} interactive={finePointer} />
      </motion.div>

      {/* Legibility gradients and the hand-off into the next section. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-void via-void/70 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[45%] bg-gradient-to-r from-void/70 to-transparent md:block" />

      <AnimatePresence>
        {!cinematic && (
          <motion.div
            className="pointer-events-none absolute top-24 right-5 hidden flex-col items-end gap-1 font-mono text-[10px] tracking-[0.18em] text-dim uppercase md:right-8 md:flex"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 1.4, duration: 1 }}
          >
            <span className="flex items-center gap-2 text-mist">
              <span className="live-dot" /> Live heliocentric view
            </span>
            <span>Sizes &amp; distances not to scale</span>
            <span>{finePointer ? 'Drag to orbit · click a planet' : 'Tap a planet to fly to it'}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-0 mx-auto flex max-w-[1440px] flex-col justify-end gap-6 px-5 pb-6 md:px-8 md:pb-8">
        <div className="flex flex-col items-stretch justify-between gap-6 md:flex-row md:items-end">
          <AnimatePresence mode="wait">
            {showCopy ? (
              <motion.div
                key="copy"
                exit={{ opacity: 0, y: 20, filter: 'blur(6px)' }}
                transition={{ duration: 0.5, ease: EASE }}
                className="pointer-events-auto max-w-[920px]"
              >
                <motion.div style={{ y: copyY, opacity: copyOpacity }}>
                <motion.span className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5, duration: 1 }}>
                  Interactive 3D model
                </motion.span>
                <h1 className="display mt-5 text-[clamp(2.9rem,7vw,6.6rem)]">
                  <HeadingLine delay={0.35}>Explore the</HeadingLine>
                  <HeadingLine delay={0.5}>
                    Solar System<span className="text-lime">.</span>
                  </HeadingLine>
                </h1>
                <motion.p
                  className="mt-6 max-w-[420px] text-[15px] leading-relaxed text-mist md:text-base"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9, duration: 1, ease: EASE }}
                >
                  Eight planets. One star. Endless possibilities to explore the universe.
                </motion.p>
                <motion.div className="mt-8 flex flex-wrap gap-3" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.05, duration: 1, ease: EASE }}>
                  <button className="btn-lime" onClick={() => scrollToId('planets')}>
                    Explore Planets
                    <span className="btn-icon">
                      <ArrowDown size={14} />
                    </span>
                  </button>
                  <button className="btn-ghost" onClick={() => scene.set({ cinematic: true, speed: Math.max(1, scene.get().speed) })}>
                    <Play size={12} />
                    Watch Universe
                  </button>
                </motion.div>
                </motion.div>
              </motion.div>
            ) : (
              <span key="spacer" />
            )}
          </AnimatePresence>

          <AnimatePresence>{selected && !cinematic && <PlanetPanel id={selected} />}</AnimatePresence>
        </div>

        <AnimatePresence>
          {!cinematic && (
            <motion.div
              className="flex flex-col-reverse items-stretch gap-3 border-t border-white/[0.07] pt-4 md:flex-row md:items-center md:justify-between"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ delay: 1.2, duration: 0.9, ease: EASE }}
            >
              <PlanetRail />
              <div className="flex justify-end">
                <SceneControls />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {cinematic && (
          <motion.div className="absolute inset-0 z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.8 }}>
            <button className="btn-ghost absolute top-5 right-5 md:top-8 md:right-8" onClick={() => scene.set({ cinematic: false })}>
              <Close size={14} /> Exit tour
              <span className="hidden font-mono text-[10px] text-dim md:inline">ESC</span>
            </button>
            <div className="pointer-events-none absolute inset-x-0 bottom-10 flex flex-col items-center text-center">
              <AnimatePresence mode="wait">
                <motion.div
                  key={tourPlanet?.id ?? 'overview'}
                  initial={{ opacity: 0, y: 16, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: -10, filter: 'blur(8px)' }}
                  transition={{ duration: 0.9, ease: EASE }}
                >
                  <span className="font-mono text-[11px] tracking-[0.2em] text-lime uppercase">
                    {tourPlanet ? `${String(tourPlanet.index).padStart(2, '0')} / 08 · ${tourPlanet.kind}` : 'The Solar System'}
                  </span>
                  <p className="display mt-3 text-5xl md:text-7xl">{tourPlanet ? tourPlanet.name : 'One star, eight worlds'}</p>
                  <p className="mt-3 text-sm text-mist">{tourPlanet ? tourPlanet.tagline : '4.6 billion years in motion'}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
