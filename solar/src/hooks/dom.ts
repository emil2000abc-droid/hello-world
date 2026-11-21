import { useEffect, useState, type RefObject } from 'react';

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

export function useInView(ref: RefObject<Element | null>, rootMargin = '0px'): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return inView;
}

export const NAV_SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'planets', label: 'Planets' },
  { id: 'exploration', label: 'Exploration' },
  { id: 'facts', label: 'Facts' },
] as const;

/** The nav section whose top has most recently passed the upper third of the viewport. */
export function useActiveSection(): string {
  const [active, setActive] = useState<string>('overview');
  useEffect(() => {
    const ids = NAV_SECTIONS.map((s) => s.id);
    const update = () => {
      const line = window.innerHeight * 0.35;
      let current: string = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return active;
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
