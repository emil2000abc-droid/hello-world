import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { ACESFilmicToneMapping } from 'three';
import type { Planet } from '../data/planets';
import { buildPlanet } from './bodies';
import { PORTRAIT_LIGHT } from './portraits';

function Body({ planet }: { planet: Planet }) {
  const body = useMemo(() => buildPlanet(planet, PORTRAIT_LIGHT, 160), [planet]);
  useEffect(() => {
    body.root.rotation.x = planet.scene.rings ? 0.32 : 0.12;
    return () => body.dispose();
  }, [body, planet]);
  useFrame((s, dt) => body.update(s.clock.elapsedTime, dt, 0.6));
  return <primitive object={body.root} />;
}

/** Frame the planet whatever the container's shape. */
function Fit({ extent }: { extent: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const d = (extent * 1.22) / Math.tan((30 * Math.PI) / 360) / Math.min(1, aspect);
    camera.position.setLength(d);
    camera.updateProjectionMatrix();
  }, [camera, size, extent]);
  return null;
}

/** Large, draggable, slowly turning planet for the detail dialog. */
export function PlanetViewer({ planet }: { planet: Planet }) {
  const extent = planet.scene.rings ? planet.scene.radius * planet.scene.rings.outer : planet.scene.radius;
  const distance = (extent * 1.25) / Math.tan((30 * Math.PI) / 360);
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ fov: 30, position: [0, 0, distance], near: 0.05, far: 100 }}
      gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping }}
      style={{ touchAction: 'none' }}
    >
      <Body planet={planet} />
      <Fit extent={extent} />
      <OrbitControls enablePan={false} enableZoom minDistance={distance * 0.55} maxDistance={distance * 2.4} rotateSpeed={0.6} enableDamping />
    </Canvas>
  );
}
