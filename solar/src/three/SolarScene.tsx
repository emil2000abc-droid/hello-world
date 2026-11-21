import { Html, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import { useEffect, useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { PLANETS, type Planet, type PlanetId } from '../data/planets';
import { scene as store, selectPlanet, resetView, useScene } from '../state/store';
import { buildPlanet, buildSun, type PlanetBody } from './bodies';
import { STAR_FRAGMENT, STAR_VERTEX } from './shaders';

const SUN_RADIUS = 3.1;
const LIME = new Color('#c7ff3d');
const ORIGIN = new Vector3();
const INTRO_SECONDS = 2.8;

/** Live planet positions, shared with the camera rig and labels. */
const positions = new Map<PlanetId, Vector3>(PLANETS.map((p) => [p.id, new Vector3()]));

/** Angular speed on the orbit: Kepler's ratios, compressed so Neptune visibly moves. */
function orbitRate(p: Planet): number {
  return 0.55 / Math.pow(p.yearDays / 365.25, 0.62);
}

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

function useIntro() {
  const start = useRef<number | null>(null);
  return (elapsed: number) => {
    start.current ??= elapsed;
    return ease((elapsed - start.current) / INTRO_SECONDS);
  };
}

// ---------------------------------------------------------------- stars

function Stars({ count = 4200 }) {
  const { gl } = useThree();
  const [geometry, material] = useMemo(() => {
    const g = new BufferGeometry();
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const phase = new Float32Array(count);
    const color = new Float32Array(count * 3);
    const tints = [new Color('#ffffff'), new Color('#cfe0ff'), new Color('#fff1d6'), new Color('#e8ffd0')];
    for (let i = 0; i < count; i++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = 260 + Math.random() * 320;
      const s = Math.sqrt(1 - u * u);
      pos.set([r * s * Math.cos(th), r * u, r * s * Math.sin(th)], i * 3);
      const big = Math.random() < 0.04;
      size[i] = big ? 2.6 + Math.random() * 1.8 : 0.9 + Math.random() * 1.3;
      phase[i] = Math.random();
      const c = tints[Math.floor(Math.random() * tints.length)];
      const b = 0.55 + Math.random() * 0.45;
      color.set([c.r * b, c.g * b, c.b * b], i * 3);
    }
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('aSize', new BufferAttribute(size, 1));
    g.setAttribute('aPhase', new BufferAttribute(phase, 1));
    g.setAttribute('aColor', new BufferAttribute(color, 3));
    const m = new ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      uniforms: { uTime: { value: 0 }, uPixelRatio: { value: Math.min(2, gl.getPixelRatio()) } },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    return [g, m];
  }, [count, gl]);
  useFrame((s) => {
    material.uniforms.uTime.value = s.clock.elapsedTime;
  });
  useEffect(() => () => (geometry.dispose(), material.dispose()), [geometry, material]);
  return <points geometry={geometry} material={material} />;
}

// ---------------------------------------------------------------- asteroid belt

function AsteroidBelt() {
  const ref = useRef<Points>(null);
  const intro = useIntro();
  const [geometry, material] = useMemo(() => {
    const n = 2600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 15.6 + Math.random() * 1.9 + (Math.random() - 0.5) * 0.6;
      pos.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.45, Math.sin(a) * r], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    const m = new PointsMaterial({ color: '#8d877c', size: 0.07, sizeAttenuation: true, transparent: true, opacity: 0.7, depthWrite: false });
    return [g, m];
  }, []);
  useFrame((s, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 0.012 * store.get().speed;
    material.opacity = 0.7 * intro(s.clock.elapsedTime);
  });
  return <points ref={ref} geometry={geometry} material={material} />;
}

// ---------------------------------------------------------------- orbits

function Orbit({ planet }: { planet: Planet }) {
  const intro = useIntro();
  const segments = 256;
  const line = useMemo(() => {
    const pts = new Float32Array((segments + 1) * 3);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2 + planet.scene.phase;
      pts.set([Math.cos(a) * planet.scene.orbit, 0, -Math.sin(a) * planet.scene.orbit], i * 3);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pts, 3));
    const m = new LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false });
    return new Line(g, m);
  }, [planet]);
  const white = useMemo(() => new Color('#ffffff'), []);
  useFrame((s, dt) => {
    const st = store.get();
    const active = st.hovered === planet.id || st.selected === planet.id;
    const m = line.material as LineBasicMaterial;
    const k = 1 - Math.exp(-dt * 8);
    m.color.lerp(active ? LIME : white, k);
    m.opacity += ((active ? 0.85 : 0.13) - m.opacity) * k;
    // Orbits draw themselves in during the intro.
    line.geometry.setDrawRange(0, Math.ceil(intro(s.clock.elapsedTime) * (segments + 1)));
  });
  useEffect(() => () => (line.geometry.dispose(), (line.material as LineBasicMaterial).dispose()), [line]);
  return <primitive object={line} />;
}

// ---------------------------------------------------------------- planets

function PlanetNode({ planet }: { planet: Planet }) {
  const group = useRef<Group>(null);
  const body = useMemo<PlanetBody>(() => buildPlanet(planet, ORIGIN, 72), [planet]);
  const angle = useRef(planet.scene.phase);
  const glow = useRef(0);
  const intro = useIntro();
  const ring = useRef<Mesh>(null);
  const labels = useScene((s) => s.labels);
  const hovered = useScene((s) => s.hovered === planet.id);
  const selected = useScene((s) => s.selected === planet.id);
  const cinematic = useScene((s) => s.cinematic);
  const hitGeometry = useMemo(() => new SphereGeometry(Math.max(body.extent, 0.7) * 1.6, 16, 12), [body]);
  const ringGeometry = useMemo(() => new RingGeometry(body.extent * 1.55, body.extent * 1.55 + Math.max(0.035, body.extent * 0.03), 96), [body]);
  const ringMaterial = useMemo(() => new MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), []);

  useEffect(() => () => (body.dispose(), hitGeometry.dispose(), ringGeometry.dispose(), ringMaterial.dispose()), [body, hitGeometry, ringGeometry, ringMaterial]);

  useFrame((s, dt) => {
    const g = group.current;
    if (!g) return;
    const st = store.get();
    angle.current += dt * orbitRate(planet) * st.speed * 0.25;
    const a = angle.current;
    g.position.set(Math.cos(a) * planet.scene.orbit, 0, -Math.sin(a) * planet.scene.orbit);
    positions.get(planet.id)!.copy(g.position);
    const shown = intro(s.clock.elapsedTime);
    g.scale.setScalar(Math.max(0.001, shown));
    // Hover glow; a followed planet is shown clean.
    const active = st.hovered === planet.id && st.selected !== planet.id;
    glow.current += ((active ? 1 : 0) - glow.current) * (1 - Math.exp(-dt * 10));
    body.setHighlight(glow.current * 0.8);
    body.update(s.clock.elapsedTime, dt, Math.max(0.25, st.speed));
    if (ring.current) {
      ring.current.quaternion.copy(s.camera.quaternion);
      const pulse = 1 + Math.sin(s.clock.elapsedTime * 3) * 0.03;
      ring.current.scale.setScalar(pulse);
      ringMaterial.opacity = glow.current * 0.9;
    }
  });

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    store.set({ hovered: planet.id });
    document.body.style.cursor = 'pointer';
  };
  const onOut = () => {
    if (store.get().hovered === planet.id) store.set({ hovered: null });
    document.body.style.cursor = '';
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 6 || store.get().cinematic) return;
    selectPlanet(planet.id);
  };

  const showLabel = !cinematic && (labels || hovered) && !selected;
  return (
    <group ref={group}>
      <primitive object={body.root} />
      <mesh geometry={hitGeometry} onPointerOver={onOver} onPointerOut={onOut} onClick={onClick} visible={false} />
      <mesh ref={ring} geometry={ringGeometry} material={ringMaterial} />
      {showLabel && (
        <Html position={[0, body.extent * 1.9 + 0.35, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="scene-label">
            <span>{String(planet.index).padStart(2, '0')}</span>
            {planet.name}
          </div>
        </Html>
      )}
    </group>
  );
}

function Sun() {
  const body = useMemo(() => buildSun(SUN_RADIUS), []);
  const intro = useIntro();
  useEffect(() => () => body.dispose(), [body]);
  useFrame((s) => {
    body.update(s.clock.elapsedTime);
    body.root.scale.setScalar(0.4 + 0.6 * intro(s.clock.elapsedTime));
  });
  return (
    <group>
      <primitive object={body.root} />
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta <= 6 && !store.get().cinematic) resetView();
        }}
        visible={false}
      >
        <sphereGeometry args={[SUN_RADIUS, 24, 16]} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------- camera

function overviewDistance(aspect: number): number {
  // Fit the outer orbits on wide screens; on tall phones crop them a little.
  return aspect >= 1 ? 66 : Math.min(118, 66 / Math.pow(aspect, 0.75));
}

const DEFAULT_DIR = new Vector3(0, 0.42, 1).normalize();

function CameraRig({ interactive }: { interactive: boolean }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera, size } = useThree();
  const steer = useRef<{ dir: Vector3; until: number } | null>({ dir: DEFAULT_DIR.clone(), until: Infinity });
  const prevTarget = useMemo(() => new Vector3(), []);
  const tmp = useMemo(() => new Vector3(), []);
  const selected = useScene((s) => s.selected);
  const resetToken = useScene((s) => s.resetToken);
  const cinematic = useScene((s) => s.cinematic);
  const intro = useIntro();

  // Shift the projection so the subject clears the overlay: the headline in
  // overview, the info panel when following a planet. Eased every frame.
  const offset = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => () => (camera as PerspectiveCamera).clearViewOffset(), [camera]);
  const applyOffset = (dt: number, focused: boolean) => {
    const cam = camera as PerspectiveCamera;
    const narrow = size.width < 768;
    const wide = size.width >= 1024;
    const goal = focused ? { x: wide ? 0.1 : 0, y: narrow ? 0.24 : 0.02 } : { x: wide ? -0.1 : 0, y: narrow ? 0.1 : 0.05 };
    const cur = (offset.current ??= { ...goal });
    const k = 1 - Math.exp(-dt * 3);
    cur.x += (goal.x - cur.x) * k;
    cur.y += (goal.y - cur.y) * k;
    cam.setViewOffset(size.width, size.height, size.width * cur.x, size.height * cur.y, size.width, size.height);
    cam.updateProjectionMatrix();
  };

  // Pick a flattering angle when a planet is chosen: lit side, slightly above.
  useEffect(() => {
    if (!selected) {
      steer.current = { dir: DEFAULT_DIR.clone(), until: performance.now() + 2500 };
      return;
    }
    // Fresh vectors: `tmp` is reused by the frame loop.
    const towardSun = positions.get(selected)!.clone().multiplyScalar(-1).normalize();
    const side = new Vector3(-towardSun.z, 0, towardSun.x);
    const dir = towardSun.multiplyScalar(0.8).add(side.multiplyScalar(0.45)).add(new Vector3(0, 0.32, 0)).normalize();
    steer.current = { dir, until: performance.now() + 2600 };
  }, [selected, resetToken]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => {
      if (steer.current && steer.current.until !== Infinity) steer.current = null;
    };
    c.addEventListener('start', stop);
    return () => c.removeEventListener('start', stop);
  }, [interactive]);

  useFrame((s, dt) => {
    const c = controls.current;
    const st = store.get();
    applyOffset(dt, !!st.selected && !st.cinematic);
    const target = c ? c.target : prevTarget;
    const k = 1 - Math.exp(-dt * 3.2);
    const planet = st.selected ? PLANETS.find((p) => p.id === st.selected)! : null;
    const goal = planet ? positions.get(planet.id)! : ORIGIN;

    const before = tmp.copy(target);
    target.lerp(goal, planet ? Math.min(1, k * 1.6) : k);
    // Follow the target so a moving planet stays framed.
    s.camera.position.add(before.sub(target).multiplyScalar(-1));

    const offset = s.camera.position.clone().sub(target);
    let dist = offset.length();
    const dir = offset.normalize();
    const base = planet ? (planet.scene.rings ? planet.scene.radius * planet.scene.rings.outer * 3.6 : planet.scene.radius * 6.5) : overviewDistance(size.width / size.height);
    const introFar = planet ? 1 : 1 + (1 - intro(s.clock.elapsedTime)) * 0.9;
    const want = base * st.zoom * introFar;
    dist += (want - dist) * k;
    if (steer.current) {
      dir.lerp(steer.current.dir, k * 0.9).normalize();
      if (performance.now() > steer.current.until) steer.current = null;
    }
    s.camera.position.copy(target).add(dir.multiplyScalar(dist));
    s.camera.lookAt(target);
    if (c) {
      c.autoRotate = st.cinematic || (!planet && st.speed > 0 && !interactive);
      c.autoRotateSpeed = st.cinematic ? 0.55 : 0.25;
      c.update();
    }
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={interactive && !cinematic}
      enableZoom={false}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.5}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI * 0.62}
    />
  );
}

// ---------------------------------------------------------------- canvas

export function SolarCanvas({ active, interactive }: { active: boolean; interactive: boolean }) {
  return (
    <Canvas
      className="!absolute inset-0"
      frameloop={active ? 'always' : 'never'}
      dpr={[1, 1.75]}
      camera={{ fov: 40, near: 0.1, far: 2000, position: [0, 40, 90] }}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      onPointerMissed={() => store.set({ hovered: null })}
      onCreated={({ gl }) => gl.setClearColor('#020203')}
    >
      <Stars />
      <Sun />
      {PLANETS.map((p) => (
        <Orbit key={`o-${p.id}`} planet={p} />
      ))}
      <AsteroidBelt />
      {PLANETS.map((p) => (
        <PlanetNode key={p.id} planet={p} />
      ))}
      <CameraRig interactive={interactive} />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur luminanceThreshold={0.62} luminanceSmoothing={0.25} intensity={0.95} radius={0.7} />
        <Vignette offset={0.32} darkness={0.72} />
        <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      </EffectComposer>
    </Canvas>
  );
}
