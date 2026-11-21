import { motion } from 'motion/react';
import { useMemo, useState } from 'react';
import { PLANETS, formatDay, formatNumber, formatTemp, formatYear, type Planet } from '../data/planets';
import { scene } from '../state/store';
import { Sort } from './Icons';
import { Reveal, SectionHeading } from './Reveal';

type Mode = 'absolute' | 'earth';

interface Column {
  key: string;
  label: string;
  value: (p: Planet) => number;
  show: (p: Planet, mode: Mode) => string;
  bar?: boolean;
}

const E = PLANETS.find((p) => p.id === 'earth')!;

const COLUMNS: Column[] = [
  { key: 'distance', label: 'Distance from Sun', value: (p) => p.distanceAu, show: (p, m) => (m === 'earth' ? `${formatNumber(p.distanceAu, 2)} AU` : `${formatNumber(p.distanceMkm, 1)} M km`) },
  { key: 'diameter', label: 'Diameter', value: (p) => p.diameterKm, show: (p, m) => (m === 'earth' ? `${formatNumber(p.diameterKm / E.diameterKm, 2)}×` : `${formatNumber(p.diameterKm)} km`), bar: true },
  { key: 'mass', label: 'Mass', value: (p) => p.massEarths, show: (p, m) => (m === 'earth' ? `${formatNumber(p.massEarths, p.massEarths < 10 ? 3 : 1)}×` : `${formatNumber(p.mass24, p.mass24 < 1 ? 3 : p.mass24 < 100 ? 2 : 0)} × 10²⁴ kg`) },
  { key: 'day', label: 'Day', value: (p) => Math.abs(p.dayHours), show: (p, m) => (m === 'earth' ? `${formatNumber(Math.abs(p.dayHours) / 23.93, 2)}×` : formatDay(p.dayHours).replace(' (retrograde)', ' ↺')) },
  { key: 'year', label: 'Year', value: (p) => p.yearDays, show: (p, m) => (m === 'earth' ? `${formatNumber(p.yearDays / 365.25, 2)}×` : formatYear(p.yearDays)) },
  { key: 'moons', label: 'Moons', value: (p) => p.moons, show: (p) => String(p.moons) },
  { key: 'temp', label: 'Mean temp', value: (p) => p.meanTempC, show: (p) => formatTemp(p.meanTempC) },
  { key: 'gravity', label: 'Gravity', value: (p) => p.gravity, show: (p, m) => (m === 'earth' ? `${formatNumber(p.gravity / 9.81, 2)} g` : `${formatNumber(p.gravity, 1)} m/s²`) },
];

export function DataSection() {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'distance', dir: 'asc' });
  const [mode, setMode] = useState<Mode>('absolute');
  const col = COLUMNS.find((c) => c.key === sort.key)!;
  const rows = useMemo(() => [...PLANETS].sort((a, b) => (col.value(a) - col.value(b)) * (sort.dir === 'asc' ? 1 : -1)), [col, sort.dir]);
  const maxBy = useMemo(() => Object.fromEntries(COLUMNS.map((c) => [c.key, Math.max(...PLANETS.map(c.value))])), []);

  const toggle = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'distance' ? 'asc' : 'desc' }));

  return (
    <section id="data" className="relative mx-auto max-w-[1440px] scroll-mt-20 px-5 py-24 md:px-8 md:py-32">
      <SectionHeading
        eyebrow="Planetary data"
        title={
          <>
            The numbers,
            <br />
            <span className="text-mist">side by side.</span>
          </>
        }
        intro="Sort any column to compare the worlds. Switch to Earth-relative values to see how strange our neighbours really are. Select a row for the full profile."
        aside={
          <div className="glass flex rounded-full p-1" role="group" aria-label="Units">
            {(['absolute', 'earth'] as Mode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`relative rounded-full px-4 py-2 text-[13px] transition-colors ${mode === m ? 'text-black' : 'text-mist hover:text-ink'}`} aria-pressed={mode === m}>
                {mode === m && <motion.span layoutId="unit-pill" className="absolute inset-0 rounded-full bg-lime" transition={{ type: 'spring', stiffness: 380, damping: 34 }} />}
                <span className="relative">{m === 'absolute' ? 'Absolute' : 'Earth = 1'}</span>
              </button>
            ))}
          </div>
        }
      />
      <Reveal className="mt-14">
        <div className="glass overflow-x-auto rounded-[28px]">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th scope="col" className="sticky left-0 z-10 bg-[#0a0b0c] py-4 pr-4 pl-6 font-mono text-[10px] font-normal tracking-[0.16em] text-dim uppercase md:bg-transparent">
                  Planet
                </th>
                {COLUMNS.map((c) => (
                  <th key={c.key} scope="col" className="px-4 py-4 font-normal" aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button onClick={() => toggle(c.key)} className={`flex items-center gap-1 font-mono text-[10px] tracking-[0.16em] uppercase transition-colors ${sort.key === c.key ? 'text-lime' : 'text-dim hover:text-ink'}`}>
                      {c.label}
                      <Sort size={12} dir={sort.key === c.key ? sort.dir : null} />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <motion.tbody layout>
              {rows.map((p) => (
                <motion.tr
                  layout
                  key={p.id}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  onClick={() => scene.set({ modal: p.id, modalFromCard: false })}
                  className="group cursor-pointer border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03]"
                >
                  <th scope="row" className="sticky left-0 z-10 bg-[#0a0b0c] py-4 pr-4 pl-6 font-normal md:bg-transparent">
                    <button onClick={() => scene.set({ modal: p.id, modalFromCard: false })} className="flex items-center gap-3 text-left" aria-label={`${p.name}: open the full profile`}>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full transition-shadow group-hover:shadow-[0_0_0_3px_rgba(199,255,61,0.35)]" style={{ background: p.color }} />
                      <span className="text-[15px] text-ink">{p.name}</span>
                      <span className="hidden font-mono text-[10px] text-dim lg:inline">{p.kind}</span>
                    </button>
                  </th>
                  {COLUMNS.map((c) => {
                    const top = c.value(p) === maxBy[c.key];
                    return (
                      <td key={c.key} className={`tabular px-4 py-4 whitespace-nowrap ${sort.key === c.key ? 'text-ink' : 'text-mist'}`}>
                        <span className="flex items-center gap-2">
                          {c.show(p, mode)}
                          {top && <span className="h-1 w-1 rounded-full bg-lime" title="Highest in this column" />}
                        </span>
                        {c.bar && (
                          <span className="mt-1.5 block h-px w-20 bg-white/10">
                            <span className="block h-px bg-lime/70" style={{ width: `${Math.max(3, (c.value(p) / maxBy[c.key]) * 100)}%` }} />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
        </div>
        <p className="mt-4 font-mono text-[10px] tracking-[0.12em] text-dim">↺ retrograde rotation · lime dot = highest value in the column · source: NASA Planetary Fact Sheet, moons as of early 2025</p>
      </Reveal>
    </section>
  );
}
