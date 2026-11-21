// Renders a still "photo" of every planet once, using the same shaders as the
// 3D scene, so the cards show real renders without eight WebGL contexts.

import { useSyncExternalStore } from 'react';
import { ACESFilmicToneMapping, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import { PLANETS, type PlanetId } from '../data/planets';
import { buildPlanet } from './bodies';

const SIZE = 480;
const cache = new Map<PlanetId, string>();
const listeners = new Set<() => void>();
let version = 0;
let started = false;

function emit(): void {
  version++;
  for (const l of listeners) l();
}

/** Light from the upper left and slightly in front, for a three-quarter look. */
export const PORTRAIT_LIGHT = new Vector3(-60, 26, 48);

export function renderPortraits(): void {
  if (started) return;
  started = true;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);

  const queue = [...PLANETS];
  const step = () => {
    const planet = queue.shift();
    if (!planet) {
      renderer.dispose();
      renderer.forceContextLoss();
      return;
    }
    const scene = new Scene();
    const body = buildPlanet(planet, PORTRAIT_LIGHT, 128);
    // Show a little of the ring plane and the tilt.
    body.root.rotation.x = planet.scene.rings ? 0.32 : 0.12;
    body.update(planet.index * 3.1, planet.index * 0.7, 1);
    scene.add(body.root);
    const fit = body.extent * 1.18;
    camera.position.set(0, 0, fit / Math.tan((camera.fov * Math.PI) / 360));
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    cache.set(planet.id, renderer.domElement.toDataURL('image/png'));
    body.dispose();
    emit();
    // One planet per frame keeps the page responsive while shaders compile.
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function usePortrait(id: PlanetId): string | undefined {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return cache.get(id);
}
