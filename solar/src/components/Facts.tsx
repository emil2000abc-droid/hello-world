import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { FACTS } from '../data/content';
import { ChevronLeft, ChevronRight, Shuffle } from './Icons';
import { Reveal, SectionHeading } from './Reveal';

const EASE = [0.16, 1, 0.3, 1] as const;
const AUTOPLAY_MS = 8000;

export function FactsSection() {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const fact = FACTS[index];

  const go = (next: number, d = next > index ? 1 : -1) => {
    setDir(d);
    setIndex((next + FACTS.length) % FACTS.length);
  };

  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(() => go(index + 1, 1), AUTOPLAY_MS);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused]);

  return (
    <section id="facts" className="relative mx-auto max-w-[1440px] scroll-mt-20 px-5 py-24 md:px-8 md:py-36">
      <SectionHeading
        eyebrow="Did you know?"
        title={
          <>
            The universe is
            <br />
            <span className="text-mist">stranger than fiction.</span>
          </>
        }
      />
      <Reveal className="mt-14">
        <div
          ref={box}
          className="glass relative overflow-hidden rounded-[32px] p-6 md:p-12"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <div className="pointer-events-none absolute -top-40 -right-40 h-[420px] w-[420px] rounded-full bg-lime opacity-[0.06] blur-[100px]" />
          <div className="relative grid min-h-[300px] gap-10 md:grid-cols-[1.2fr_1fr] md:items-center">
            <AnimatePresence mode="wait" custom={dir}>
              <motion.div
                key={fact.id}
                custom={dir}
                initial={{ opacity: 0, x: dir * 40, filter: 'blur(8px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: dir * -40, filter: 'blur(8px)' }}
                transition={{ duration: 0.6, ease: EASE }}
                aria-live="polite"
              >
                <div className="font-mono text-[11px] tracking-[0.18em] text-mist uppercase">
                  <span className="text-lime">{String(index + 1).padStart(2, '0')}</span> / {FACTS.length} · {fact.topic}
                </div>
                <div className="display mt-6 text-[clamp(3.4rem,9vw,7.5rem)] text-lime">{fact.figure}</div>
              </motion.div>
            </AnimatePresence>
            <AnimatePresence mode="wait">
              <motion.div key={fact.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.55, ease: EASE, delay: 0.05 }}>
                <h3 className="text-2xl font-medium tracking-[-0.03em] md:text-3xl">{fact.title}</h3>
                <p className="mt-4 text-[15px] leading-relaxed text-mist md:text-base">{fact.text}</p>
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="relative mt-10 flex flex-wrap items-center gap-3 border-t border-white/[0.07] pt-6">
            <button className="icon-button" onClick={() => go(index - 1, -1)} aria-label="Previous fact">
              <ChevronLeft />
            </button>
            <button className="icon-button" onClick={() => go(index + 1, 1)} aria-label="Next fact">
              <ChevronRight />
            </button>
            <button
              className="btn-ghost !h-10"
              onClick={() => {
                let n = index;
                while (n === index) n = Math.floor(Math.random() * FACTS.length);
                go(n, 1);
              }}
            >
              <Shuffle size={14} /> Surprise me
            </button>
            <div className="ml-auto flex items-center gap-1.5" role="tablist" aria-label="Facts">
              {FACTS.map((f, i) => (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={i === index}
                  aria-label={f.title}
                  onClick={() => go(i)}
                  className="relative h-1.5 overflow-hidden rounded-full bg-white/15 transition-all duration-500"
                  style={{ width: i === index ? 28 : 8 }}
                >
                  {i === index && (
                    <motion.span
                      key={`${index}-${paused}`}
                      className="absolute inset-y-0 left-0 bg-lime"
                      initial={{ width: paused ? '100%' : '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: paused ? 0 : AUTOPLAY_MS / 1000, ease: 'linear' }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Reveal>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FACTS.slice(0, 8).map((f, i) => (
          <Reveal key={f.id} delay={(i % 4) * 0.06}>
            <button
              onClick={() => {
                go(i);
                box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              className={`group flex h-full w-full flex-col rounded-3xl border p-5 text-left transition-colors duration-500 ${i === index ? 'border-lime/50 bg-lime/[0.04]' : 'border-white/[0.07] hover:border-white/20'}`}
            >
              <span className="font-mono text-[10px] tracking-[0.16em] text-dim uppercase">{f.topic}</span>
              <span className="mt-3 text-[15px] leading-snug text-ink">{f.title}</span>
              <span className="tabular mt-auto pt-6 text-sm text-mist transition-colors group-hover:text-lime">{f.figure}</span>
            </button>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
