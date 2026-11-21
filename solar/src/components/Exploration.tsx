import { AnimatePresence, motion, useScroll, useSpring } from 'motion/react';
import { useRef, useState } from 'react';
import { MISSIONS, MISSION_FILTERS, type Mission } from '../data/content';
import { Plus } from './Icons';
import { SectionHeading } from './Reveal';

const EASE = [0.16, 1, 0.3, 1] as const;

function MissionItem({ m, side }: { m: Mission; side: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.8, ease: EASE }}
      className={`relative grid grid-cols-[28px_1fr] gap-4 md:grid-cols-[1fr_56px_1fr] md:gap-0`}
    >
      <div className={`hidden md:block ${side === 'left' ? 'md:col-start-1' : 'md:col-start-3 md:row-start-1'}`}>
        <article className={`glass group rounded-3xl p-6 transition-colors duration-500 hover:border-lime/40 ${side === 'left' ? 'md:mr-6' : 'md:ml-6'}`}>
          <Card m={m} open={open} setOpen={setOpen} />
        </article>
      </div>
      <div className={`relative flex justify-center md:col-start-2 md:row-start-1`}>
        <span className="relative mt-7 h-3 w-3 rounded-full border border-lime bg-void shadow-[0_0_14px_rgba(199,255,61,0.6)]">
          <span className="absolute inset-[3px] rounded-full bg-lime" />
        </span>
      </div>
      <div className="md:hidden">
        <article className="glass rounded-3xl p-5">
          <Card m={m} open={open} setOpen={setOpen} />
        </article>
      </div>
    </motion.li>
  );
}

function Card({ m, open, setOpen }: { m: Mission; open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="display tabular text-4xl text-lime">{m.year}</span>
        <span className="font-mono text-[10px] tracking-[0.16em] text-dim uppercase">{m.agency}</span>
      </div>
      <h3 className="mt-4 text-xl font-medium tracking-[-0.02em]">{m.name}</h3>
      <p className="mt-1 text-sm text-mist">{m.summary}</p>
      <div className="mt-4 flex flex-wrap gap-2 font-mono text-[10px] tracking-[0.12em] uppercase">
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-mist">{m.kind}</span>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-mist">{m.destination}</span>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.p initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.45, ease: EASE }} className="overflow-hidden text-sm leading-relaxed text-ink/80">
            <span className="block pt-4">{m.detail}</span>
          </motion.p>
        )}
      </AnimatePresence>
      <button onClick={() => setOpen(!open)} className="mt-4 inline-flex items-center gap-2 text-[13px] text-mist transition-colors hover:text-lime" aria-expanded={open}>
        <span className={`grid h-6 w-6 place-items-center rounded-full border border-white/15 transition-transform duration-500 ${open ? 'rotate-45 border-lime text-lime' : ''}`}>
          <Plus size={12} />
        </span>
        {open ? 'Less' : 'Mission details'}
      </button>
    </>
  );
}

export function ExplorationSection() {
  const [filter, setFilter] = useState<(typeof MISSION_FILTERS)[number]>('All');
  const list = MISSIONS.filter((m) => filter === 'All' || m.target === filter);
  const track = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: track, offset: ['start 70%', 'end 60%'] });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });

  return (
    <section id="exploration" className="relative mx-auto max-w-[1440px] scroll-mt-20 px-5 py-24 md:px-8 md:py-36">
      <SectionHeading
        eyebrow="Space exploration"
        title={
          <>
            Seven decades
            <br />
            <span className="text-mist">of reaching out.</span>
          </>
        }
        intro="From a beeping metal sphere in 1957 to probes beyond the heliosphere. The missions that turned points of light into places."
      />
      <div className="mt-10 flex flex-wrap gap-2" role="group" aria-label="Filter missions by destination">
        {MISSION_FILTERS.map((f) => (
          <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f}
            <span className="font-mono text-[10px] opacity-70">{f === 'All' ? MISSIONS.length : MISSIONS.filter((m) => m.target === f).length}</span>
          </button>
        ))}
      </div>

      <div ref={track} className="relative mt-14">
        <div className="absolute top-0 bottom-0 left-[13.5px] w-px bg-white/[0.08] md:left-1/2 md:-translate-x-1/2" />
        <motion.div className="absolute top-0 bottom-0 left-[13.5px] w-px origin-top bg-lime shadow-[0_0_12px_#c7ff3d] md:left-1/2 md:-translate-x-1/2" style={{ scaleY: progress }} />
        <motion.ol layout className="relative flex flex-col gap-6 md:gap-2">
          <AnimatePresence mode="popLayout">
            {list.map((m, i) => (
              <MissionItem key={m.id} m={m} side={i % 2 === 0 ? 'left' : 'right'} />
            ))}
          </AnimatePresence>
        </motion.ol>
      </div>
    </section>
  );
}
