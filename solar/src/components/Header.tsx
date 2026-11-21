import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { NAV_SECTIONS, useActiveSection } from '../hooks/dom';
import { scene, scrollToId, selectPlanet, useScene } from '../state/store';
import { ArrowUpRight, Close, LogoMark, Menu } from './Icons';

const EASE = [0.16, 1, 0.3, 1] as const;

/** Header "Explore" starts interactive mode: back to the hero, camera on Earth. */
export function startExploring(): void {
  scene.set({ cinematic: false, modal: null });
  scrollToId('overview');
  selectPlanet('earth');
}

export function Header() {
  const active = useActiveSection();
  const cinematic = useScene((s) => s.cinematic);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    scrollToId(id);
  };

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: cinematic ? -90 : 0, opacity: cinematic ? 0 : 1 }}
      transition={{ duration: 0.9, ease: EASE, delay: cinematic ? 0 : 0.2 }}
      className="fixed inset-x-0 top-0 z-50"
    >
      <div
        className={`mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-5 py-4 transition-[background,backdrop-filter,border-color] duration-500 md:px-8 ${
          scrolled ? 'border-b border-white/[0.06] bg-black/40 backdrop-blur-xl' : 'border-b border-transparent'
        }`}
      >
        <button onClick={() => go('overview')} className="flex items-center gap-2.5 rounded-full text-ink" aria-label="SOLAR — back to top">
          <LogoMark />
          <span className="text-[15px] font-semibold tracking-[0.32em]">SOLAR</span>
        </button>

        <nav className="glass absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full p-1 md:flex" aria-label="Sections">
          {NAV_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => go(s.id)}
              className={`relative rounded-full px-4 py-1.5 text-[13px] transition-colors duration-300 ${active === s.id ? 'text-black' : 'text-mist hover:text-ink'}`}
              aria-current={active === s.id ? 'true' : undefined}
            >
              {active === s.id && (
                <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-lime" transition={{ type: 'spring', stiffness: 380, damping: 34 }} />
              )}
              <span className="relative">{s.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button onClick={startExploring} className="btn-lime !h-10 !pl-4">
            Explore
            <span className="btn-icon !h-7 !w-7">
              <ArrowUpRight size={14} />
            </span>
          </button>
          <button className="icon-button md:hidden" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open}>
            <Menu />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex flex-col bg-black/80 px-5 pt-4 pb-10 backdrop-blur-2xl md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            role="dialog"
            aria-label="Menu"
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2.5">
                <LogoMark />
                <span className="text-[15px] font-semibold tracking-[0.32em]">SOLAR</span>
              </span>
              <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close menu" autoFocus>
                <Close />
              </button>
            </div>
            <nav className="mt-16 flex flex-col gap-2" aria-label="Sections">
              {NAV_SECTIONS.map((s, i) => (
                <motion.button
                  key={s.id}
                  onClick={() => go(s.id)}
                  initial={{ y: 24, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.05 + i * 0.06, duration: 0.6, ease: EASE }}
                  className="flex items-baseline justify-between border-b border-white/[0.07] py-4 text-left"
                >
                  <span className={`display text-5xl ${active === s.id ? 'text-lime' : 'text-ink'}`}>{s.label}</span>
                  <span className="font-mono text-xs text-dim">0{i + 1}</span>
                </motion.button>
              ))}
            </nav>
            <button
              className="btn-lime mt-auto self-start"
              onClick={() => {
                setOpen(false);
                startExploring();
              }}
            >
              Explore the system
              <span className="btn-icon">
                <ArrowUpRight size={14} />
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
