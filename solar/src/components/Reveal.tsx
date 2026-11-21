import { motion } from 'motion/react';
import type { ReactNode } from 'react';

const EASE = [0.16, 1, 0.3, 1] as const;

/** Fades and lifts content into place the first time it scrolls into view. */
export function Reveal({ children, delay = 0, className, y = 28 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, filter: 'blur(6px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: 1, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

export function SectionHeading({ eyebrow, title, intro, aside }: { eyebrow: string; title: ReactNode; intro?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
      <div className="max-w-[760px]">
        <Reveal>
          <span className="eyebrow">{eyebrow}</span>
        </Reveal>
        <Reveal delay={0.08}>
          <h2 className="display mt-5 text-[clamp(2.4rem,5.6vw,4.8rem)]">{title}</h2>
        </Reveal>
        {intro && (
          <Reveal delay={0.16}>
            <p className="mt-5 max-w-[540px] text-[15px] leading-relaxed text-mist md:text-base">{intro}</p>
          </Reveal>
        )}
      </div>
      {aside && <Reveal delay={0.2}>{aside}</Reveal>}
    </div>
  );
}
