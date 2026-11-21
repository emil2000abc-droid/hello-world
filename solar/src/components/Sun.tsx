import { animate, AnimatePresence, motion, useInView } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { SUN } from '../data/content';
import { formatNumber } from '../data/planets';
import { Reveal, SectionHeading } from './Reveal';

type LayerId = (typeof SUN.layers)[number]['id'];
const EASE = [0.16, 1, 0.3, 1] as const;

function CountUp({ value, digits }: { value: number; digits: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  useEffect(() => {
    if (!inView || !ref.current) return;
    const el = ref.current;
    const c = animate(0, value, { duration: 1.8, ease: EASE, onUpdate: (v) => (el.textContent = formatNumber(v, digits)) });
    return () => c.stop();
  }, [inView, value, digits]);
  return (
    <span ref={ref} className="tabular">
      {formatNumber(0, digits)}
    </span>
  );
}

const C = 260;
const R = 190;

/** A wedge from the 12 o'clock to the 3 o'clock direction between two radii. */
function wedge(r0: number, r1: number): string {
  const a = `M ${C} ${C - r1} A ${r1} ${r1} 0 0 1 ${C + r1} ${C}`;
  if (r0 <= 0) return `${a} L ${C} ${C} Z`;
  return `${a} L ${C + r0} ${C} A ${r0} ${r0} 0 0 0 ${C} ${C - r0} Z`;
}

const BANDS: { id: LayerId; r0: number; r1: number; fill: string }[] = [
  { id: 'convective', r0: 0.7, r1: 0.985, fill: 'url(#g-convective)' },
  { id: 'radiative', r0: 0.25, r1: 0.7, fill: 'url(#g-radiative)' },
  { id: 'core', r0: 0, r1: 0.25, fill: 'url(#g-core)' },
  { id: 'photosphere', r0: 0.985, r1: 1, fill: '#fff0c2' },
];

function SunDiagram({ active }: { active: LayerId }) {
  return (
    <svg viewBox="0 0 520 520" className="h-auto w-full max-w-[560px]" role="img" aria-label={`Cross-section of the Sun with the ${active} highlighted`}>
      <defs>
        <radialGradient id="g-surface" cx="42%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#ffe3a1" />
          <stop offset="45%" stopColor="#ffa83a" />
          <stop offset="85%" stopColor="#e2540f" />
          <stop offset="100%" stopColor="#9a2c06" />
        </radialGradient>
        <radialGradient id="g-corona" cx="50%" cy="50%" r="50%">
          <stop offset="70%" stopColor="#ff9a3c" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ff9a3c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="g-core" cx={C} cy={C} r={R * 0.25} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#ffd66b" />
        </radialGradient>
        <radialGradient id="g-radiative" cx={C} cy={C} r={R * 0.7} gradientUnits="userSpaceOnUse">
          <stop offset="35%" stopColor="#ffc457" />
          <stop offset="100%" stopColor="#ff8a2b" />
        </radialGradient>
        <radialGradient id="g-convective" cx={C} cy={C} r={R} gradientUnits="userSpaceOnUse">
          <stop offset="70%" stopColor="#ff7a1f" />
          <stop offset="100%" stopColor="#d9480d" />
        </radialGradient>
        <filter id="f-granules" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="7" />
          <feColorMatrix values="0 0 0 0 1  0 0 0 0 0.85  0 0 0 0 0.6  0 0 0 0.55 -0.12" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        <clipPath id="c-disk">
          <circle cx={C} cy={C} r={R} />
        </clipPath>
      </defs>

      <motion.circle cx={C} cy={C} r={250} fill="url(#g-corona)" animate={{ opacity: active === 'corona' ? 1 : 0.55, scale: [1, 1.03, 1] }} style={{ originX: '50%', originY: '50%' }} transition={{ opacity: { duration: 0.6 }, scale: { duration: 6, repeat: Infinity, ease: 'easeInOut' } }} />
      {active === 'corona' && <circle cx={C} cy={C} r={236} fill="none" stroke="#c7ff3d" strokeWidth="1" strokeDasharray="2 6" />}

      <g clipPath="url(#c-disk)">
        <circle cx={C} cy={C} r={R} fill="url(#g-surface)" />
        <motion.g animate={{ rotate: 360 }} transition={{ duration: 160, repeat: Infinity, ease: 'linear' }} style={{ originX: `${C}px`, originY: `${C}px` }}>
          <rect x={C - R * 1.5} y={C - R * 1.5} width={R * 3} height={R * 3} fill="#fff" filter="url(#f-granules)" opacity="0.55" />
        </motion.g>
      </g>

      {/* Cut-away quadrant. */}
      <path d={wedge(0, R + 1)} fill="#030304" />
      {BANDS.map((b) => (
        <motion.path key={b.id} d={wedge(b.r0 * R, b.r1 * R)} fill={b.fill} animate={{ opacity: active === b.id || active === 'corona' ? 1 : 0.62 }} transition={{ duration: 0.5 }} />
      ))}
      {/* Convection cells hint. */}
      {Array.from({ length: 6 }, (_, i) => {
        const a = ((i + 0.5) / 6) * (Math.PI / 2);
        const r = R * 0.84;
        return <circle key={i} cx={C + Math.sin(a) * r} cy={C - Math.cos(a) * r} r={R * 0.1} fill="none" stroke="#ffd29a" strokeOpacity={active === 'convective' ? 0.7 : 0.25} strokeDasharray="3 4" />;
      })}
      {BANDS.filter((b) => b.id === active).map((b) => (
        <path key={`o-${b.id}`} d={wedge(b.r0 * R, b.r1 * R)} fill="none" stroke="#c7ff3d" strokeWidth="1.5" />
      ))}
      <line x1={C} y1={C - R - 30} x2={C} y2={C} stroke="#ffffff" strokeOpacity="0.25" />
      <line x1={C} y1={C} x2={C + R + 30} y2={C} stroke="#ffffff" strokeOpacity="0.25" />
      <text x={C + R + 34} y={C + 4} fill="#9a9f95" fontSize="10" fontFamily="Geist Mono, monospace" letterSpacing="2">
        R☉
      </text>
    </svg>
  );
}

export function SunSection() {
  const [active, setActive] = useState<LayerId>('core');
  const layer = SUN.layers.find((l) => l.id === active)!;
  return (
    <section id="sun" className="relative mx-auto max-w-[1440px] scroll-mt-20 px-5 py-24 md:px-8 md:py-36">
      <div className="pointer-events-none absolute top-1/3 left-[10%] h-[420px] w-[min(420px,80%)] rounded-full bg-[#ff7a1f] opacity-[0.07] blur-[120px]" />
      <SectionHeading
        eyebrow="The Sun"
        title={
          <>
            Our star holds
            <br />
            <span className="text-mist">everything together.</span>
          </>
        }
        intro="A middle-aged yellow dwarf of type G2V. Its gravity keeps every planet in orbit, and the energy from its core powers weather, oceans and life on Earth."
      />

      <div className="mt-16 grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
        <Reveal className="flex justify-center">
          <SunDiagram active={active} />
        </Reveal>
        <Reveal delay={0.1}>
          <div className="font-mono text-[11px] tracking-[0.18em] text-dim uppercase">Inside the Sun · select a layer</div>
          <ul className="mt-4 divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {SUN.layers.map((l) => {
              const on = l.id === active;
              return (
                <li key={l.id}>
                  <button
                    onClick={() => setActive(l.id)}
                    onMouseEnter={() => setActive(l.id)}
                    className="group flex w-full items-center justify-between gap-4 py-4 text-left"
                    aria-pressed={on}
                  >
                    <span className={`text-lg tracking-[-0.02em] transition-colors md:text-xl ${on ? 'text-ink' : 'text-mist group-hover:text-ink'}`}>
                      <span className={`mr-3 inline-block h-1.5 w-1.5 rounded-full align-middle transition-colors ${on ? 'bg-lime shadow-[0_0_10px_#c7ff3d]' : 'bg-white/20'}`} />
                      {l.name}
                    </span>
                    <span className={`tabular font-mono text-xs ${on ? 'text-lime' : 'text-dim'}`}>{l.temp}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <AnimatePresence mode="wait">
            <motion.div key={active} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.4, ease: EASE }} className="mt-6">
              <div className="font-mono text-[11px] tracking-[0.16em] text-mist uppercase">{layer.depth}</div>
              <p className="mt-2 max-w-[520px] text-[15px] leading-relaxed text-ink/85">{layer.text}</p>
            </motion.div>
          </AnimatePresence>
        </Reveal>
      </div>

      <div className="mt-20 grid grid-cols-2 gap-px overflow-hidden rounded-[28px] border border-white/[0.07] bg-white/[0.07] lg:grid-cols-4">
        {SUN.stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 0.06} className="bg-void p-6 md:p-8">
            <div className="font-mono text-[10px] tracking-[0.18em] text-dim uppercase">{s.label}</div>
            <div className="display mt-4 text-[clamp(2.2rem,4.4vw,3.6rem)]">
              <CountUp value={s.value} digits={s.digits} />
            </div>
            <div className="mt-2 text-sm text-mist">{s.unit}</div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
