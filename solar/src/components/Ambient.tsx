import { motion, useScroll, useSpring } from 'motion/react';
import { useEffect, useRef } from 'react';

/** Site-wide twinkling starfield behind every section, with gentle scroll parallax. */
export function StarField() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let stars: { x: number; y: number; r: number; p: number; s: number; a: number }[] = [];
    let w = 0;
    let h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round((w * h) / 4200);
      stars = Array.from({ length: n }, () => {
        const big = Math.random() < 0.05;
        return { x: Math.random() * w, y: Math.random() * h * 1.6, r: big ? 0.9 + Math.random() * 0.8 : 0.3 + Math.random() * 0.55, p: Math.random() * Math.PI * 2, s: 0.4 + Math.random() * 1.6, a: 0.25 + Math.random() * 0.6 };
      });
    };
    resize();
    window.addEventListener('resize', resize);
    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 33) return;
      last = t;
      ctx.clearRect(0, 0, w, h);
      const off = (window.scrollY * 0.06) % (h * 1.6);
      for (const s of stars) {
        const tw = reduce ? 1 : 0.6 + 0.4 * Math.sin(t * 0.001 * s.s + s.p);
        let y = s.y - off;
        if (y < 0) y += h * 1.6;
        if (y > h) continue;
        ctx.globalAlpha = s.a * tw;
        ctx.fillStyle = s.r > 0.9 ? '#f4ffe0' : '#dfe6ee';
        ctx.beginPath();
        ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />;
}

export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const x = useSpring(scrollYProgress, { stiffness: 140, damping: 30 });
  return <motion.div className="fixed inset-x-0 top-0 z-[70] h-px origin-left bg-lime shadow-[0_0_10px_#c7ff3d]" style={{ scaleX: x }} aria-hidden="true" />;
}

const TICKER = [
  ['4.6', 'billion years old'],
  ['8', 'planets'],
  ['99.86%', 'of the mass is the Sun'],
  ['400+', 'known moons'],
  ['1 AU', '= 149.6 million km'],
  ['≈ 4 h', 'for sunlight to reach Neptune'],
  ['30 AU', 'to the edge of the planets'],
];

export function Marquee() {
  const items = [...TICKER, ...TICKER];
  return (
    <div className="marquee relative overflow-hidden border-y border-white/[0.06] py-5" aria-label="The Solar System in numbers">
      <div className="marquee-track flex w-max items-center gap-12">
        {items.map(([n, t], i) => (
          <span key={i} className="flex items-center gap-12 whitespace-nowrap" aria-hidden={i >= TICKER.length}>
            <span className="flex items-baseline gap-3">
              <span className="display tabular text-3xl text-ink">{n}</span>
              <span className="font-mono text-[11px] tracking-[0.16em] text-mist uppercase">{t}</span>
            </span>
            <span className="h-1.5 w-1.5 rotate-45 bg-lime" />
          </span>
        ))}
      </div>
    </div>
  );
}
