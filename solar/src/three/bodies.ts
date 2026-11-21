// Builders for celestial bodies in plain three.js. The hero scene, the card
// portraits and the detail viewer all use these, so every planet looks the
// same everywhere.

import {
  AdditiveBlending,
  BackSide,
  Color,
  DoubleSide,
  Group,
  Mesh,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type Material,
} from 'three';
import type { Planet } from '../data/planets';
import {
  ATMOSPHERE_FRAGMENT,
  CLOUDS_FRAGMENT,
  CORONA_FRAGMENT,
  CORONA_VERTEX,
  PLANET_VERTEX,
  RING_FRAGMENT,
  RING_VERTEX,
  SUN_FRAGMENT,
  planetFragment,
} from './shaders';

export interface PlanetBody {
  root: Group;
  /** Radius used for picking and camera framing (includes rings). */
  extent: number;
  setHighlight(v: number): void;
  update(time: number, dt: number, spinRate: number): void;
  dispose(): void;
}

/** Visual rotation speed, compressed so slow rotators still visibly turn. */
export function spinSpeed(planet: Planet): number {
  const h = Math.abs(planet.dayHours);
  return (Math.sign(planet.dayHours) || 1) * (0.9 / Math.pow(h, 0.45));
}

export function buildPlanet(planet: Planet, lightPos: Vector3, segments = 96): PlanetBody {
  const r = planet.scene.radius;
  const root = new Group();
  root.name = planet.id;
  const tilt = new Group();
  tilt.rotation.z = (planet.tiltDeg * Math.PI) / 180;
  root.add(tilt);
  const spinner = new Group();
  tilt.add(spinner);

  const materials: Material[] = [];
  const geoms: { dispose(): void }[] = [];
  const sphere = new SphereGeometry(r, segments, Math.round(segments * 0.66));
  geoms.push(sphere);

  const rim = new Color(planet.scene.atmosphere?.color ?? planet.color);
  const surfaceMat = new ShaderMaterial({
    vertexShader: PLANET_VERTEX,
    fragmentShader: planetFragment(planet.id),
    uniforms: {
      uTime: { value: 0 },
      uLightPos: { value: lightPos },
      uHighlight: { value: 0 },
      uRimColor: { value: rim },
    },
  });
  materials.push(surfaceMat);
  spinner.add(new Mesh(sphere, surfaceMat));

  let cloudMat: ShaderMaterial | null = null;
  let clouds: Mesh | null = null;
  if (planet.id === 'earth') {
    cloudMat = new ShaderMaterial({
      vertexShader: PLANET_VERTEX,
      fragmentShader: CLOUDS_FRAGMENT,
      uniforms: { uTime: { value: 0 }, uLightPos: { value: lightPos } },
      transparent: true,
      depthWrite: false,
    });
    materials.push(cloudMat);
    const cg = new SphereGeometry(r * 1.012, segments, Math.round(segments * 0.66));
    geoms.push(cg);
    clouds = new Mesh(cg, cloudMat);
    tilt.add(clouds);
  }

  if (planet.scene.atmosphere) {
    const am = new ShaderMaterial({
      vertexShader: PLANET_VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
      uniforms: {
        uColor: { value: new Color(planet.scene.atmosphere.color) },
        uLightPos: { value: lightPos },
        uStrength: { value: planet.scene.atmosphere.strength },
      },
      side: BackSide,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    materials.push(am);
    const ag = new SphereGeometry(r * 1.11, 64, 40);
    geoms.push(ag);
    tilt.add(new Mesh(ag, am));
  }

  let ringMat: ShaderMaterial | null = null;
  if (planet.scene.rings) {
    const inner = r * planet.scene.rings.inner;
    const outer = r * planet.scene.rings.outer;
    ringMat = new ShaderMaterial({
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      uniforms: {
        uInner: { value: inner },
        uOuter: { value: outer },
        uLightPos: { value: lightPos },
        uPlanetPos: { value: new Vector3() },
        uPlanetRadius: { value: r },
        uTint: { value: new Color(planet.id === 'saturn' ? '#e8d6ad' : '#b9e6ea') },
        uFaint: { value: planet.id === 'saturn' ? 0 : 1 },
      },
      transparent: true,
      side: DoubleSide,
      depthWrite: false,
    });
    materials.push(ringMat);
    const rg = new RingGeometry(inner, outer, 160, 1);
    geoms.push(rg);
    const ring = new Mesh(rg, ringMat);
    ring.rotation.x = -Math.PI / 2;
    tilt.add(ring);
  }

  const world = new Vector3();
  return {
    root,
    extent: planet.scene.rings ? r * planet.scene.rings.outer : r,
    setHighlight(v) {
      surfaceMat.uniforms.uHighlight.value = v;
    },
    update(time, dt, spinRate) {
      surfaceMat.uniforms.uTime.value = time;
      spinner.rotation.y += dt * spinSpeed(planet) * spinRate;
      if (cloudMat && clouds) {
        cloudMat.uniforms.uTime.value = time;
        clouds.rotation.y += dt * spinSpeed(planet) * spinRate * 1.12;
      }
      if (ringMat) {
        root.getWorldPosition(world);
        ringMat.uniforms.uPlanetPos.value.copy(world);
      }
    },
    dispose() {
      for (const m of materials) m.dispose();
      for (const g of geoms) g.dispose();
    },
  };
}

export interface SunBody {
  root: Group;
  update(time: number): void;
  dispose(): void;
}

export function buildSun(radius: number, coronaScale = 3.2): SunBody {
  const root = new Group();
  const sphere = new SphereGeometry(radius, 96, 64);
  const mat = new ShaderMaterial({
    vertexShader: PLANET_VERTEX,
    fragmentShader: SUN_FRAGMENT,
    uniforms: { uTime: { value: 0 } },
    toneMapped: false,
  });
  const surface = new Mesh(sphere, mat);
  root.add(surface);

  const quad = new PlaneGeometry(2, 2);
  const corona = new ShaderMaterial({
    vertexShader: CORONA_VERTEX,
    fragmentShader: CORONA_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new Color('#ff9a3c') },
      uInner: { value: 1 / coronaScale },
    },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    toneMapped: false,
  });
  const glow = new Mesh(quad, corona);
  glow.scale.setScalar(radius * coronaScale);
  glow.renderOrder = -1;
  root.add(glow);

  return {
    root,
    update(time) {
      mat.uniforms.uTime.value = time;
      corona.uniforms.uTime.value = time;
      surface.rotation.y = time * 0.02;
    },
    dispose() {
      sphere.dispose();
      quad.dispose();
      mat.dispose();
      corona.dispose();
    },
  };
}
