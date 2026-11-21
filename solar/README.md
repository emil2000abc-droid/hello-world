# SOLAR — Explore the Solar System

An interactive 3D guide to the eight planets and the Sun: a live WebGL model of the system in the hero, planet profiles, a cutaway of the Sun, sortable planetary data, a timeline of space exploration and a fact deck.

Stack: React 19, TypeScript, Vite, React Three Fiber + drei + postprocessing (Three.js), Motion (Framer Motion), Tailwind CSS 4. Fonts: Geist and Geist Mono.

## Run

```bash
cd solar
npm install
npm run dev            # development server
npm run build          # typecheck + production build in dist/
npm test               # data and formatting tests
npm run build:single   # dist/solar.html: the whole site in one file
```

## What is interactive

- **3D system (hero).** Drag to orbit (mouse), hover a planet to light it and its orbit, click or tap to fly the camera to it. Its info panel offers previous/next and a full profile. Arrow keys switch planets, Esc returns to the overview. The controls pause the orbits, set the speed (1×, 5×, 20×), toggle labels, zoom and reset. Clicking the Sun also resets the view.
- **Watch Universe.** Hides the interface and tours the planets one by one. Esc or "Exit tour" ends it.
- **Explore (header).** Returns to the hero and focuses Earth.
- **Planets.** Filter by class. Cards open a dialog with a live, draggable 3D planet, a size comparison with Earth and full statistics, with previous/next and "Show in the solar system".
- **The Sun.** Pick a layer to highlight it in the cutaway and read its temperature and role.
- **Planetary data.** Sort any column and switch between absolute and Earth-relative units. Rows open the planet dialog.
- **Space exploration.** Filter missions by destination and expand each for details. The timeline line fills as you scroll.
- **Did you know?** Auto-advancing facts (paused on hover), previous/next, "Surprise me" and direct picks.

## How the planets are drawn

No image textures are used. Every surface is computed per pixel in GLSL from 3D simplex and Worley noise on the unit sphere (`src/three/shaders.ts`), so there are no seams and detail holds at any zoom:
- Mercury: craters at three scales.
- Venus: domain-warped cloud deck.
- Earth: continents, biomes, ice caps, specular oceans, a drifting cloud shell and city lights on the night side.
- Mars: albedo regions and polar caps.
- Jupiter: turbulent bands and the Great Red Spot.
- Saturn: rings with Cassini and Encke gaps and the planet's shadow.
- Uranus and Neptune: banding, Neptune's dark spot and streak clouds.

The Sun has animated granulation, limb darkening and a corona, finished with bloom. The planet cards use stills rendered once by the same shaders.

Sizes and distances are compressed so all eight worlds fit on one screen. Orbital speeds keep the real order (Kepler's ratios, compressed).

## Structure

```
src/
  data/        planets (NASA Planetary Fact Sheet), Sun, missions, facts
  state/       scene store shared by the 3D loop and the UI
  three/       shaders, body builders, hero scene, portrait renderer, detail viewer
  components/  header, hero, sections, dialog, footer
  hooks/       media queries, in-view, active section
```

Sources: NASA Planetary Fact Sheet, NASA Solar System Exploration, ESA. Moon counts are as of early 2025.
