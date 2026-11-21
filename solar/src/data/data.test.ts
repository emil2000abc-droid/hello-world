import { describe, expect, it } from 'vitest';
import { FACTS, MISSIONS, MISSION_FILTERS, SUN } from './content';
import { PLANETS, PLANET_BY_ID, formatDay, formatTemp, formatYear, neighbour } from './planets';

describe('planet data', () => {
  it('lists the eight planets in order from the Sun', () => {
    expect(PLANETS.map((p) => p.name)).toEqual(['Mercury', 'Venus', 'Earth', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']);
    for (let i = 1; i < PLANETS.length; i++) {
      expect(PLANETS[i].distanceAu).toBeGreaterThan(PLANETS[i - 1].distanceAu);
      expect(PLANETS[i].yearDays).toBeGreaterThan(PLANETS[i - 1].yearDays);
      // Scene orbits keep the real order and never overlap neighbours.
      const gap = PLANETS[i].scene.orbit - PLANETS[i - 1].scene.orbit;
      const reach = (p: (typeof PLANETS)[number]) => (p.scene.rings ? p.scene.radius * p.scene.rings.outer : p.scene.radius);
      expect(gap).toBeGreaterThan(reach(PLANETS[i]) + reach(PLANETS[i - 1]));
    }
  });

  it('keeps derived values consistent with NASA figures', () => {
    for (const p of PLANETS) {
      expect(p.distanceMkm / p.distanceAu).toBeGreaterThan(148);
      expect(p.distanceMkm / p.distanceAu).toBeLessThan(151);
      expect(p.mass24 / p.massEarths).toBeGreaterThan(5.8);
      expect(p.mass24 / p.massEarths).toBeLessThan(6.1);
    }
    expect(PLANET_BY_ID.earth.distanceAu).toBe(1);
  });

  it('cycles between neighbours', () => {
    expect(neighbour('mercury', -1)).toBe('neptune');
    expect(neighbour('neptune', 1)).toBe('mercury');
    expect(neighbour('earth', 1)).toBe('mars');
  });
});

describe('formatting', () => {
  it('formats days, years and temperatures', () => {
    expect(formatDay(23.9)).toBe('23 h 54 m');
    expect(formatDay(-5832.5)).toBe('243.0 days (retrograde)');
    expect(formatYear(687)).toBe('687 days');
    expect(formatYear(10747)).toBe('29.4 years');
    expect(formatTemp(-65)).toBe('−65 °C');
    expect(formatTemp(464)).toBe('464 °C');
  });
});

describe('content', () => {
  it('has unique ids and a filter for every mission target', () => {
    for (const list of [MISSIONS, FACTS, SUN.layers]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    for (const m of MISSIONS) expect(MISSION_FILTERS).toContain(m.target);
    const years = MISSIONS.map((m) => m.year);
    expect([...years].sort((a, b) => a - b)).toEqual(years);
  });
});
