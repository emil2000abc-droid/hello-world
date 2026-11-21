// Planet facts follow the NASA Planetary Fact Sheet. Scene values (orbit,
// size) are artistic: real distances would make every planet a single pixel.

export type PlanetId = 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';

export type PlanetClass = 'Terrestrial' | 'Gas giant' | 'Ice giant';

export interface Planet {
  id: PlanetId;
  name: string;
  index: number;
  kind: PlanetClass;
  tagline: string;
  summary: string;
  description: string[];
  /** Mean diameter, km. */
  diameterKm: number;
  /** Mass relative to Earth. */
  massEarths: number;
  /** Mass, 10²⁴ kg. */
  mass24: number;
  /** Mean distance from the Sun, millions of km. */
  distanceMkm: number;
  /** Semi-major axis, AU. */
  distanceAu: number;
  /** Orbital period, Earth days. */
  yearDays: number;
  /** Sidereal rotation period, hours (negative = retrograde). */
  dayHours: number;
  /** Mean surface / cloud-top temperature, °C. */
  meanTempC: number;
  /** Surface gravity, m/s². */
  gravity: number;
  /** Known moons as of early 2025. */
  moons: number;
  /** Axial tilt, degrees. */
  tiltDeg: number;
  /** Mean density, g/cm³. */
  density: number;
  highlight: { label: string; value: string };
  /** UI accent sampled from the planet's palette. */
  color: string;
  scene: {
    orbit: number;
    radius: number;
    /** Starting angle on the orbit, radians. */
    phase: number;
    rings?: { inner: number; outer: number };
    atmosphere?: { color: string; strength: number };
  };
}

export const PLANETS: Planet[] = [
  {
    id: 'mercury',
    name: 'Mercury',
    index: 1,
    kind: 'Terrestrial',
    tagline: 'The swift, scorched messenger',
    summary: 'The smallest planet and the closest to the Sun, circling it every 88 days.',
    description: [
      'Mercury races around the Sun faster than any other planet. With almost no atmosphere to hold heat, its surface swings from about 430 °C in daylight to −180 °C at night.',
      'Its cratered crust hides an enormous iron core that fills roughly 85% of the planet’s radius, which is why tiny Mercury is the second-densest planet after Earth.',
    ],
    diameterKm: 4879,
    massEarths: 0.055,
    mass24: 0.330,
    distanceMkm: 57.9,
    distanceAu: 0.387,
    yearDays: 88.0,
    dayHours: 1407.6,
    meanTempC: 167,
    gravity: 3.7,
    moons: 0,
    tiltDeg: 0.03,
    density: 5.43,
    highlight: { label: 'Temperature swing', value: '610 °C' },
    color: '#b9b2a9',
    scene: { orbit: 6.2, radius: 0.3, phase: 0.6 },
  },
  {
    id: 'venus',
    name: 'Venus',
    index: 2,
    kind: 'Terrestrial',
    tagline: 'A greenhouse under golden clouds',
    summary: 'The hottest planet, wrapped in sulfuric-acid clouds and a crushing CO₂ atmosphere.',
    description: [
      'Venus is almost Earth’s twin in size, but its thick carbon-dioxide atmosphere traps heat so well that the surface stays near 465 °C, hot enough to melt lead.',
      'It spins backwards and very slowly: one rotation takes 243 Earth days, longer than its 225-day year. Surface pressure is about 92 times Earth’s.',
    ],
    diameterKm: 12104,
    massEarths: 0.815,
    mass24: 4.87,
    distanceMkm: 108.2,
    distanceAu: 0.723,
    yearDays: 224.7,
    dayHours: -5832.5,
    meanTempC: 464,
    gravity: 8.9,
    moons: 0,
    tiltDeg: 177.4,
    density: 5.24,
    highlight: { label: 'Surface pressure', value: '92 bar' },
    color: '#e2c58a',
    scene: { orbit: 8.6, radius: 0.52, phase: 2.4, atmosphere: { color: '#ffd9a0', strength: 0.9 } },
  },
  {
    id: 'earth',
    name: 'Earth',
    index: 3,
    kind: 'Terrestrial',
    tagline: 'The pale blue dot',
    summary: 'The only world known to host life, with liquid water covering 71% of its surface.',
    description: [
      'Earth sits in the Sun’s habitable zone, where water stays liquid. Its nitrogen-oxygen atmosphere and magnetic field shield the surface from harmful radiation.',
      'Plate tectonics constantly renew its crust, and a single large Moon steadies its axial tilt, giving Earth relatively stable seasons over long spans of time.',
    ],
    diameterKm: 12756,
    massEarths: 1,
    mass24: 5.97,
    distanceMkm: 149.6,
    distanceAu: 1,
    yearDays: 365.2,
    dayHours: 23.9,
    meanTempC: 15,
    gravity: 9.8,
    moons: 1,
    tiltDeg: 23.4,
    density: 5.51,
    highlight: { label: 'Surface water', value: '71%' },
    color: '#5f9bd8',
    scene: { orbit: 11.2, radius: 0.56, phase: 4.1, atmosphere: { color: '#7fb6ff', strength: 1.1 } },
  },
  {
    id: 'mars',
    name: 'Mars',
    index: 4,
    kind: 'Terrestrial',
    tagline: 'The rust-red frontier',
    summary: 'A cold desert world with the tallest volcano and the deepest canyons in the Solar System.',
    description: [
      'Iron oxide dust gives Mars its colour. The planet hosts Olympus Mons, a shield volcano about 22 km high, and Valles Marineris, a canyon system some 4,000 km long.',
      'Dry riverbeds and minerals that form in water show that Mars was once wetter. Today rovers study its rocks for signs of ancient habitability.',
    ],
    diameterKm: 6792,
    massEarths: 0.107,
    mass24: 0.642,
    distanceMkm: 228.0,
    distanceAu: 1.524,
    yearDays: 687.0,
    dayHours: 24.6,
    meanTempC: -65,
    gravity: 3.7,
    moons: 2,
    tiltDeg: 25.2,
    density: 3.93,
    highlight: { label: 'Olympus Mons', value: '≈ 22 km' },
    color: '#d0704a',
    scene: { orbit: 13.8, radius: 0.4, phase: 1.2, atmosphere: { color: '#ffb08a', strength: 0.45 } },
  },
  {
    id: 'jupiter',
    name: 'Jupiter',
    index: 5,
    kind: 'Gas giant',
    tagline: 'King of the planets',
    summary: 'More than twice as massive as all other planets combined, with a storm larger than Earth.',
    description: [
      'Jupiter is a ball of hydrogen and helium with no solid surface. Its banded clouds are stretched by winds and by the fastest spin of any planet: a day lasts under ten hours.',
      'The Great Red Spot is an anticyclone wider than Earth that has been observed for centuries. Jupiter’s gravity also shapes the asteroid belt and the paths of comets.',
    ],
    diameterKm: 142984,
    massEarths: 317.8,
    mass24: 1898,
    distanceMkm: 778.5,
    distanceAu: 5.2,
    yearDays: 4331,
    dayHours: 9.9,
    meanTempC: -110,
    gravity: 23.1,
    moons: 95,
    tiltDeg: 3.1,
    density: 1.33,
    highlight: { label: 'Length of day', value: '9 h 56 m' },
    color: '#d9b48c',
    scene: { orbit: 19.4, radius: 1.45, phase: 3.3, atmosphere: { color: '#f3d9b4', strength: 0.35 } },
  },
  {
    id: 'saturn',
    name: 'Saturn',
    index: 6,
    kind: 'Gas giant',
    tagline: 'The jewel of the system',
    summary: 'A gas giant light enough to float in water, circled by brilliant rings of ice.',
    description: [
      'Saturn’s rings span about 280,000 km yet are mostly only tens of metres thick. They are made of countless pieces of water ice, from dust grains to house-sized chunks.',
      'With a mean density of 0.69 g/cm³, Saturn is the only planet less dense than water. It has the most known moons, including Titan, which has a thick atmosphere and methane lakes.',
    ],
    diameterKm: 120536,
    massEarths: 95.2,
    mass24: 568,
    distanceMkm: 1432.0,
    distanceAu: 9.58,
    yearDays: 10747,
    dayHours: 10.7,
    meanTempC: -140,
    gravity: 9.0,
    moons: 274,
    tiltDeg: 26.7,
    density: 0.69,
    highlight: { label: 'Known moons', value: '274' },
    color: '#e3cf9c',
    scene: { orbit: 25.4, radius: 1.2, phase: 5.4, rings: { inner: 1.45, outer: 2.55 }, atmosphere: { color: '#f5e2b0', strength: 0.3 } },
  },
  {
    id: 'uranus',
    name: 'Uranus',
    index: 7,
    kind: 'Ice giant',
    tagline: 'The planet that rolls on its side',
    summary: 'An ice giant tipped over by 98°, so each pole spends 42 years in sunlight.',
    description: [
      'Uranus spins on its side, probably after an ancient collision. Over its 84-year orbit each pole faces the Sun for about 42 years, then sinks into a 42-year night.',
      'Methane in its hydrogen-helium atmosphere absorbs red light and gives the planet a pale cyan colour. It has faint rings and holds the record for the coldest planetary atmosphere, near −224 °C.',
    ],
    diameterKm: 51118,
    massEarths: 14.5,
    mass24: 86.8,
    distanceMkm: 2867.0,
    distanceAu: 19.2,
    yearDays: 30589,
    dayHours: -17.2,
    meanTempC: -195,
    gravity: 8.7,
    moons: 28,
    tiltDeg: 97.8,
    density: 1.27,
    highlight: { label: 'Axial tilt', value: '97.8°' },
    color: '#9fe0e6',
    scene: { orbit: 30.8, radius: 0.82, phase: 0.2, rings: { inner: 1.25, outer: 1.5 }, atmosphere: { color: '#b9f2ff', strength: 0.8 } },
  },
  {
    id: 'neptune',
    name: 'Neptune',
    index: 8,
    kind: 'Ice giant',
    tagline: 'The windswept blue edge',
    summary: 'The most distant planet, home to the fastest winds ever measured in the Solar System.',
    description: [
      'Neptune was the first planet found by mathematics: its position was predicted from irregularities in Uranus’s orbit before it was seen in 1846.',
      'Winds on Neptune reach about 2,000 km/h. Its largest moon, Triton, orbits backwards and is probably a captured object from the Kuiper Belt.',
    ],
    diameterKm: 49528,
    massEarths: 17.1,
    mass24: 102,
    distanceMkm: 4515.0,
    distanceAu: 30.05,
    yearDays: 59800,
    dayHours: 16.1,
    meanTempC: -200,
    gravity: 11.0,
    moons: 16,
    tiltDeg: 28.3,
    density: 1.64,
    highlight: { label: 'Wind speed', value: '≈ 2,000 km/h' },
    color: '#4f7bf0',
    scene: { orbit: 35.6, radius: 0.8, phase: 2.9, atmosphere: { color: '#86a8ff', strength: 0.85 } },
  },
];

export const PLANET_BY_ID: Record<PlanetId, Planet> = Object.fromEntries(PLANETS.map((p) => [p.id, p])) as Record<PlanetId, Planet>;

export function neighbour(id: PlanetId, dir: 1 | -1): PlanetId {
  const i = PLANETS.findIndex((p) => p.id === id);
  return PLANETS[(i + dir + PLANETS.length) % PLANETS.length].id;
}

// ------------------------------------------------------------------ formatting

const nf = new Intl.NumberFormat('en-US');

export function formatNumber(n: number, digits = 0): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

export function formatDay(hours: number): string {
  const h = Math.abs(hours);
  const retro = hours < 0 ? ' (retrograde)' : '';
  if (h >= 48) return `${formatNumber(h / 24, 1)} days${retro}`;
  const whole = Math.floor(h);
  const min = Math.round((h - whole) * 60);
  return `${whole} h${min ? ` ${min} m` : ''}${retro}`;
}

export function formatYear(days: number): string {
  if (days < 1000) return `${formatNumber(days, days % 1 ? 1 : 0)} days`;
  return `${formatNumber(days / 365.25, 1)} years`;
}

export function formatTemp(c: number): string {
  return `${c > 0 ? '' : c < 0 ? '−' : ''}${nf.format(Math.abs(c))} °C`;
}
