// Copy for the Sun, missions and facts sections.

export const SUN = {
  stats: [
    { label: 'Age', value: 4.6, digits: 1, unit: 'bn years' },
    { label: 'Diameter', value: 1.39, digits: 2, unit: 'million km' },
    { label: 'Surface', value: 5500, digits: 0, unit: '°C' },
    { label: 'Share of system mass', value: 99.86, digits: 2, unit: '%' },
  ],
  layers: [
    {
      id: 'core',
      name: 'Core',
      temp: '≈ 15 million °C',
      depth: 'Inner 25% of radius',
      text: 'Hydrogen nuclei fuse into helium here, turning about 4 million tonnes of matter into energy every second.',
    },
    {
      id: 'radiative',
      name: 'Radiative zone',
      temp: '7 → 2 million °C',
      depth: '25–70% of radius',
      text: 'Energy creeps outward as light, absorbed and re-emitted countless times. A photon can take over 100,000 years to cross it.',
    },
    {
      id: 'convective',
      name: 'Convective zone',
      temp: '2 million → 5,500 °C',
      depth: 'Outer 30% of radius',
      text: 'Hot plasma rises in giant cells, cools at the top and sinks again, carrying heat to the surface like a boiling pot.',
    },
    {
      id: 'photosphere',
      name: 'Photosphere',
      temp: '≈ 5,500 °C',
      depth: 'Visible surface, ~500 km thick',
      text: 'The layer we see. Its grainy texture comes from the tops of convection cells, and sunspots appear where magnetic fields block the heat.',
    },
    {
      id: 'corona',
      name: 'Corona',
      temp: '1–3 million °C',
      depth: 'Extends millions of km',
      text: 'The Sun’s outer atmosphere, visible during total eclipses. Oddly, it is hundreds of times hotter than the surface below it.',
    },
  ],
} as const;

export type MissionKind = 'Crewed' | 'Lander' | 'Rover' | 'Orbiter' | 'Flyby' | 'Observatory' | 'Satellite' | 'Sample return';
export type MissionTarget = 'Earth orbit' | 'Moon' | 'Inner planets' | 'Outer planets' | 'Small bodies' | 'Deep space';

export interface Mission {
  id: string;
  name: string;
  year: number;
  agency: string;
  kind: MissionKind;
  target: MissionTarget;
  destination: string;
  summary: string;
  detail: string;
}

export const MISSIONS: Mission[] = [
  {
    id: 'sputnik',
    name: 'Sputnik 1',
    year: 1957,
    agency: 'USSR',
    kind: 'Satellite',
    target: 'Earth orbit',
    destination: 'Low Earth orbit',
    summary: 'The first artificial satellite.',
    detail: 'A 58 cm metal sphere whose radio beeps were picked up around the world for 21 days. It opened the Space Age on 4 October 1957.',
  },
  {
    id: 'vostok1',
    name: 'Vostok 1',
    year: 1961,
    agency: 'USSR',
    kind: 'Crewed',
    target: 'Earth orbit',
    destination: 'One orbit of Earth',
    summary: 'Yuri Gagarin becomes the first human in space.',
    detail: 'On 12 April 1961 Gagarin completed a single orbit in 108 minutes, then ejected and landed by parachute in the Saratov region.',
  },
  {
    id: 'apollo11',
    name: 'Apollo 11',
    year: 1969,
    agency: 'NASA',
    kind: 'Crewed',
    target: 'Moon',
    destination: 'Sea of Tranquility',
    summary: 'First humans walk on the Moon.',
    detail: 'Neil Armstrong and Buzz Aldrin landed on 20 July 1969 while Michael Collins orbited above. They returned 21.5 kg of lunar samples.',
  },
  {
    id: 'venera7',
    name: 'Venera 7',
    year: 1970,
    agency: 'USSR',
    kind: 'Lander',
    target: 'Inner planets',
    destination: 'Venus',
    summary: 'First data transmitted from the surface of another planet.',
    detail: 'The lander survived the descent through Venus’s atmosphere and sent about 20 minutes of faint signals, measuring roughly 475 °C at the surface.',
  },
  {
    id: 'voyager',
    name: 'Voyager 1 & 2',
    year: 1977,
    agency: 'NASA',
    kind: 'Flyby',
    target: 'Outer planets',
    destination: 'Jupiter → interstellar space',
    summary: 'A grand tour of the giant planets, then out of the heliosphere.',
    detail: 'Voyager 2 remains the only spacecraft to have visited Uranus (1986) and Neptune (1989). Voyager 1 crossed into interstellar space in 2012, the first human-made object to do so.',
  },
  {
    id: 'hubble',
    name: 'Hubble Space Telescope',
    year: 1990,
    agency: 'NASA · ESA',
    kind: 'Observatory',
    target: 'Deep space',
    destination: 'Low Earth orbit',
    summary: 'A telescope above the atmosphere that reshaped astronomy.',
    detail: 'Serviced five times by Space Shuttle crews, Hubble helped pin down the age of the universe and the accelerating expansion of space.',
  },
  {
    id: 'cassini',
    name: 'Cassini–Huygens',
    year: 1997,
    agency: 'NASA · ESA · ASI',
    kind: 'Orbiter',
    target: 'Outer planets',
    destination: 'Saturn and Titan',
    summary: 'Thirteen years in orbit around Saturn.',
    detail: 'The Huygens probe landed on Titan in 2005, the most distant landing ever made. Cassini found geysers on Enceladus and ended its mission by diving into Saturn in 2017.',
  },
  {
    id: 'rosetta',
    name: 'Rosetta',
    year: 2004,
    agency: 'ESA',
    kind: 'Orbiter',
    target: 'Small bodies',
    destination: 'Comet 67P',
    summary: 'The first spacecraft to orbit a comet.',
    detail: 'After a ten-year chase, Rosetta reached comet 67P/Churyumov–Gerasimenko in 2014 and released the Philae lander onto its surface.',
  },
  {
    id: 'newhorizons',
    name: 'New Horizons',
    year: 2006,
    agency: 'NASA',
    kind: 'Flyby',
    target: 'Small bodies',
    destination: 'Pluto and Arrokoth',
    summary: 'The first close look at Pluto.',
    detail: 'Its 2015 flyby revealed nitrogen-ice plains and mountains of water ice on Pluto. In 2019 it passed Arrokoth, the most distant object ever explored up close.',
  },
  {
    id: 'curiosity',
    name: 'Curiosity',
    year: 2012,
    agency: 'NASA',
    kind: 'Rover',
    target: 'Inner planets',
    destination: 'Gale Crater, Mars',
    summary: 'A car-sized laboratory climbing Mount Sharp.',
    detail: 'Curiosity found that Gale Crater once held a long-lived lake with the chemistry life would need, and detected organic molecules in ancient mudstone.',
  },
  {
    id: 'change4',
    name: 'Chang’e 4',
    year: 2019,
    agency: 'CNSA',
    kind: 'Lander',
    target: 'Moon',
    destination: 'Von Kármán crater, far side',
    summary: 'The first soft landing on the far side of the Moon.',
    detail: 'Landing on 3 January 2019, it relayed data through the Queqiao satellite and deployed the Yutu-2 rover to study the far side’s geology.',
  },
  {
    id: 'hayabusa2',
    name: 'Hayabusa2',
    year: 2020,
    agency: 'JAXA',
    kind: 'Sample return',
    target: 'Small bodies',
    destination: 'Asteroid Ryugu',
    summary: 'Brought pieces of an asteroid back to Earth.',
    detail: 'The probe fired an impactor to expose fresh material on Ryugu, then returned about 5.4 grams of samples to Australia in December 2020.',
  },
  {
    id: 'perseverance',
    name: 'Perseverance & Ingenuity',
    year: 2021,
    agency: 'NASA',
    kind: 'Rover',
    target: 'Inner planets',
    destination: 'Jezero Crater, Mars',
    summary: 'Collecting samples and the first powered flight on another world.',
    detail: 'Perseverance caches rock cores for possible return to Earth. Its companion helicopter Ingenuity made 72 flights, far beyond the five originally planned.',
  },
  {
    id: 'jwst',
    name: 'James Webb Space Telescope',
    year: 2021,
    agency: 'NASA · ESA · CSA',
    kind: 'Observatory',
    target: 'Deep space',
    destination: 'Sun–Earth L2 point',
    summary: 'An infrared eye on the first galaxies.',
    detail: 'Launched on 25 December 2021, Webb’s 6.5 m gold-coated mirror studies the early universe, star birth and the atmospheres of distant exoplanets.',
  },
  {
    id: 'europaclipper',
    name: 'Europa Clipper',
    year: 2024,
    agency: 'NASA',
    kind: 'Orbiter',
    target: 'Outer planets',
    destination: 'Jupiter’s moon Europa',
    summary: 'Investigating an ocean beneath the ice.',
    detail: 'Launched in October 2024 and due at Jupiter in 2030, it will make dozens of close flybys of Europa to assess whether its hidden ocean could support life.',
  },
];

export const MISSION_FILTERS: ('All' | MissionTarget)[] = ['All', 'Earth orbit', 'Moon', 'Inner planets', 'Outer planets', 'Small bodies', 'Deep space'];

export interface Fact {
  id: string;
  title: string;
  text: string;
  figure: string;
  topic: string;
}

export const FACTS: Fact[] = [
  { id: 'venus-day', topic: 'Venus', figure: '243 d', title: 'A day longer than a year', text: 'Venus takes 243 Earth days to spin once but only 225 days to orbit the Sun.' },
  { id: 'saturn-float', topic: 'Saturn', figure: '0.69 g/cm³', title: 'Saturn would float', text: 'Saturn’s average density is lower than water’s. In a big enough ocean, it would float.' },
  { id: 'sun-light', topic: 'The Sun', figure: '8 min 20 s', title: 'Old sunlight', text: 'Sunlight takes about 8 minutes and 20 seconds to reach Earth, so you always see the Sun as it was moments ago.' },
  { id: 'sun-earths', topic: 'The Sun', figure: '1.3 M', title: 'A million Earths inside', text: 'About 1.3 million Earths would fit inside the Sun by volume.' },
  { id: 'olympus', topic: 'Mars', figure: '≈ 22 km', title: 'The tallest volcano', text: 'Olympus Mons on Mars rises about 22 km, roughly two and a half times the height of Everest.' },
  { id: 'jupiter-day', topic: 'Jupiter', figure: '9 h 56 m', title: 'The shortest day', text: 'Jupiter spins faster than any other planet, completing a rotation in under ten hours.' },
  { id: 'neptune-wind', topic: 'Neptune', figure: '≈ 2,000 km/h', title: 'Supersonic winds', text: 'Neptune’s winds are the fastest measured in the Solar System, faster than the speed of sound on Earth.' },
  { id: 'uranus-tilt', topic: 'Uranus', figure: '97.8°', title: 'Sideways seasons', text: 'Uranus is tipped on its side, so each pole gets about 42 years of continuous sunlight followed by 42 years of darkness.' },
  { id: 'moon-steps', topic: 'The Moon', figure: 'No wind', title: 'Footprints that stay', text: 'With no wind or rain on the Moon, the Apollo astronauts’ footprints could survive for millions of years.' },
  { id: 'venus-hot', topic: 'Venus', figure: '465 °C', title: 'Hotter than Mercury', text: 'Venus is nearly twice as far from the Sun as Mercury, yet hotter, because its thick atmosphere traps heat.' },
  { id: 'red-spot', topic: 'Jupiter', figure: '> Earth', title: 'A storm bigger than Earth', text: 'Jupiter’s Great Red Spot is a storm wider than our whole planet and has been watched for centuries.' },
  { id: 'mercury-core', topic: 'Mercury', figure: '85%', title: 'Almost all core', text: 'Mercury’s iron core reaches about 85% of the way to its surface, an unusually large share for a rocky planet.' },
];
