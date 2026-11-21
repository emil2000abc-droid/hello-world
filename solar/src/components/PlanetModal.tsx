import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { PLANET_BY_ID, formatDay, formatNumber, formatTemp, formatYear, neighbour, type Planet, type PlanetId } from '../data/planets';
import { useMediaQuery } from '../hooks/dom';
import { scene, showInSystem, useScene } from '../state/store';
import { PlanetViewer } from '../three/PlanetViewer';
import { ArrowUpRight, ChevronLeft, ChevronRight, Close } from './Icons';
import { PlanetImage } from './Planets';

const EASE = [0.16, 1, 0.3, 1] as const;
const EARTH = PLANET_BY_ID.earth;

function SizeCompare({ planet }: { planet: Planet }) {
  const ratio = planet.diameterKm / EARTH.diameterKm;
  const max = 92;
  const big = Math.max(ratio, 1);
  const pr = (ratio / big) * (max / 2);
  const er = (1 / big) * (max / 2);
  return (
    <div className="flex items-center gap-5 rounded-2xl border border-white/[0.07] p-4">
      <svg width={max * 2 + 24} height={max} viewBox={`0 0 ${max * 2 + 24} ${max}`} aria-hidden="true" className="shrink-0">
        <circle cx={max / 2} cy={max / 2} r={Math.max(pr, 1.5)} fill={planet.color} />
        <circle cx={max * 1.5 + 24} cy={max / 2} r={Math.max(er, 1.5)} fill="none" stroke="#c7ff3d" strokeWidth="1.2" />
      </svg>
      <p className="text-sm leading-snug text-mist">
        {planet.id === 'earth' ? (
          'The reference size for every comparison here.'
        ) : (
          <>
            <span className="tabular text-ink">{ratio >= 1 ? `${formatNumber(ratio, 1)}×` : `${formatNumber(ratio * 100)}%`}</span> {ratio >= 1 ? 'wider than' : 'of the width of'} Earth
            <span className="mt-1 block font-mono text-[10px] tracking-[0.14em] text-dim uppercase">Lime outline = Earth</span>
          </>
        )}
      </p>
    </div>
  );
}

function Stats({ planet }: { planet: Planet }) {
  const rows: [string, string, string?][] = [
    ['Distance from Sun', `${formatNumber(planet.distanceMkm, 1)} M km`, `${formatNumber(planet.distanceAu, 2)} AU`],
    ['Diameter', `${formatNumber(planet.diameterKm)} km`],
    ['Mass', `${formatNumber(planet.massEarths, planet.massEarths < 10 ? 3 : 1)} × Earth`],
    ['Length of day', formatDay(planet.dayHours)],
    ['Length of year', formatYear(planet.yearDays)],
    ['Mean temperature', formatTemp(planet.meanTempC)],
    ['Surface gravity', `${formatNumber(planet.gravity, 1)} m/s²`, `${formatNumber(planet.gravity / 9.81, 2)} g`],
    ['Known moons', String(planet.moons)],
    ['Axial tilt', `${formatNumber(planet.tiltDeg, planet.tiltDeg < 1 ? 2 : 1)}°`],
    ['Density', `${formatNumber(planet.density, 2)} g/cm³`],
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07]">
      {rows.map(([k, v, sub]) => (
        <div key={k} className="bg-[#07080a] px-4 py-3.5">
          <dt className="font-mono text-[10px] tracking-[0.16em] text-dim uppercase">{k}</dt>
          <dd className="tabular mt-1.5 text-[15px] text-ink">
            {v}
            {sub && <span className="ml-2 text-xs text-mist">{sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Dialog({ id }: { id: PlanetId }) {
  const planet = PLANET_BY_ID[id];
  const fromCard = useScene((s) => s.modalFromCard);
  const touch = useMediaQuery('(pointer: coarse)');
  const [live, setLive] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = () => scene.set({ modal: null });
  const go = (dir: 1 | -1) => {
    setLive(true);
    scene.set({ modal: neighbour(id, dir) });
  };

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={`${planet.name} profile`}>
      <motion.div className="absolute inset-0 bg-black/70 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} onClick={close} />
      <motion.div
        className="glass relative flex max-h-[94svh] w-full max-w-[1180px] flex-col overflow-hidden rounded-t-[32px] md:max-h-[88svh] md:flex-row md:rounded-[32px]"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.6, ease: EASE }}
        style={{ background: 'linear-gradient(180deg, rgba(14,15,16,0.92), rgba(6,7,8,0.96))' }}
      >
        <div className="relative h-[38svh] shrink-0 md:h-auto md:w-[48%]">
          <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 50%, ${planet.color}22, transparent 60%)` }} />
          {live ? (
            <motion.div key={`viewer-${id}`} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
              <PlanetViewer planet={planet} />
            </motion.div>
          ) : (
            <div className="absolute inset-0 grid place-items-center p-8">
              <PlanetImage planet={planet} shared={fromCard} className="w-full max-w-[440px]" />
            </div>
          )}
          {/* Swap the shared-layout image for the live view once the expand animation ends. */}
          <motion.span className="hidden" animate={{ opacity: 1 }} transition={{ delay: 0.75 }} onAnimationComplete={() => setLive(true)} />
          <span className="pointer-events-none absolute bottom-4 left-5 font-mono text-[10px] tracking-[0.18em] text-dim uppercase">{live ? (touch ? 'Drag to rotate · pinch to zoom' : 'Drag to rotate · scroll to zoom') : 'Loading 3D view'}</span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 md:p-9">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[11px] tracking-[0.18em] text-mist uppercase">
              <span className="text-lime">{String(planet.index).padStart(2, '0')}</span> / 08 · {planet.kind}
            </span>
            <div className="flex gap-2">
              <button className="icon-button" onClick={() => go(-1)} aria-label={`Previous: ${PLANET_BY_ID[neighbour(id, -1)].name}`}>
                <ChevronLeft />
              </button>
              <button className="icon-button" onClick={() => go(1)} aria-label={`Next: ${PLANET_BY_ID[neighbour(id, 1)].name}`}>
                <ChevronRight />
              </button>
              <button ref={closeRef} className="icon-button" onClick={close} aria-label="Close">
                <Close />
              </button>
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.45, ease: EASE }}>
              <h2 className="display mt-6 text-[clamp(3rem,6vw,5.2rem)]">{planet.name}</h2>
              <p className="mt-3 text-lg text-mist">{planet.tagline}</p>
              <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-ink/85">
                {planet.description.map((t) => (
                  <p key={t}>{t}</p>
                ))}
              </div>
              <div className="mt-7 flex items-baseline justify-between rounded-2xl border border-lime/25 bg-lime/[0.05] px-5 py-4">
                <span className="font-mono text-[11px] tracking-[0.16em] text-lime uppercase">{planet.highlight.label}</span>
                <span className="display text-3xl text-ink">{planet.highlight.value}</span>
              </div>
              <div className="mt-4">
                <SizeCompare planet={planet} />
              </div>
              <div className="mt-4">
                <Stats planet={planet} />
              </div>
              <p className="mt-3 font-mono text-[10px] tracking-[0.12em] text-dim">Moon counts as of early 2025. Source: NASA Planetary Fact Sheet.</p>
              <button className="btn-lime mt-7" onClick={() => showInSystem(id)}>
                Show in the solar system
                <span className="btn-icon">
                  <ArrowUpRight size={14} />
                </span>
              </button>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function PlanetModal() {
  const id = useScene((s) => s.modal);
  return <AnimatePresence>{id && <Dialog key="planet-dialog" id={id} />}</AnimatePresence>;
}
