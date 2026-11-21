// GLSL for procedurally shaded worlds. Surfaces are computed per pixel from
// 3D noise on the unit sphere, so there are no seams, no texture downloads
// and the detail holds up at any zoom.

import type { PlanetId } from '../data/planets';

export const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

// Simplex noise, Ashima Arts / Stefan Gustavson (MIT).
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p, int oct) {
  float f = 0.0, a = 0.5;
  for (int i = 0; i < 7; i++) {
    if (i >= oct) break;
    f += a * snoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 4.1);
    a *= 0.5;
  }
  return f;
}

vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453123);
}

// Distance to the nearest feature point (Worley) and that point's hash.
vec2 worley(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d = 8.0;
  float id = 0.0;
  for (int x = -1; x <= 1; x++)
  for (int y = -1; y <= 1; y++)
  for (int z = -1; z <= 1; z++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 h = hash3(i + o);
    vec3 r = o + h - f;
    float dd = dot(r, r);
    if (dd < d) { d = dd; id = h.x; }
  }
  return vec2(sqrt(d), id);
}

// Craters: bowl, raised rim, size-dependent density.
float craters(vec3 p, float scale, float density) {
  vec2 w = worley(p * scale);
  float r = mix(0.18, 0.42, fract(w.y * 7.31));
  float present = step(1.0 - density, fract(w.y * 13.7));
  float bowl = smoothstep(r, r * 0.25, w.x);
  float rim = smoothstep(r * 0.7, r, w.x) * smoothstep(r * 1.35, r, w.x);
  return present * (rim * 0.6 - bowl * 0.9);
}
`;

/** Surface colour functions, one per world. `p` is a point on the unit sphere. */
const SURFACES: Record<PlanetId, string> = {
  mercury: /* glsl */ `
    vec3 surface(vec3 p, out float spec, out float night) {
      spec = 0.0; night = 0.0;
      float n = fbm(p * 2.6, 6) * 0.5 + 0.5;
      float c = craters(p, 7.0, 0.55) + craters(p, 15.0, 0.6) * 0.6 + craters(p, 30.0, 0.7) * 0.35;
      vec3 dark = vec3(0.27, 0.255, 0.24);
      vec3 light = vec3(0.64, 0.61, 0.57);
      vec3 col = mix(dark, light, smoothstep(0.25, 0.8, n));
      col *= 1.0 + c * 0.55;
      float ray = smoothstep(0.82, 0.95, fbm(p * 9.0, 3) * 0.5 + 0.5);
      return col + ray * 0.08;
    }`,
  venus: /* glsl */ `
    vec3 surface(vec3 p, out float spec, out float night) {
      spec = 0.0; night = 0.0;
      vec3 q = p * 1.8 + vec3(uTime * 0.02, 0.0, 0.0);
      vec3 warp = vec3(fbm(q, 4), fbm(q + 5.2, 4), fbm(q + 9.1, 4));
      float n = fbm(p * vec3(2.0, 5.0, 2.0) + warp * 1.4, 6) * 0.5 + 0.5;
      vec3 a = vec3(0.78, 0.58, 0.32);
      vec3 b = vec3(0.98, 0.88, 0.66);
      vec3 c = vec3(0.62, 0.42, 0.22);
      vec3 col = mix(a, b, smoothstep(0.3, 0.75, n));
      col = mix(col, c, smoothstep(0.62, 0.9, fbm(p * 6.0 + warp, 3) * 0.5 + 0.5) * 0.35);
      return col;
    }`,
  earth: /* glsl */ `
    vec3 surface(vec3 p, out float spec, out float night) {
      vec3 warp = vec3(fbm(p * 1.3, 3), fbm(p * 1.3 + 3.3, 3), fbm(p * 1.3 + 7.7, 3)) * 0.35;
      float h = fbm(p * 1.55 + warp, 7);
      float land = smoothstep(0.035, 0.06, h);
      float lat = abs(p.y);
      // Oceans: deeper away from the coast.
      vec3 deep = vec3(0.015, 0.07, 0.2);
      vec3 shallow = vec3(0.05, 0.27, 0.45);
      vec3 ocean = mix(deep, shallow, smoothstep(-0.25, 0.04, h));
      // Land: forest, grassland, desert belts, mountains.
      float moist = fbm(p * 3.1 + 11.0, 4) * 0.5 + 0.5;
      float desertBelt = smoothstep(0.12, 0.3, lat) * smoothstep(0.55, 0.36, lat);
      vec3 forest = vec3(0.09, 0.2, 0.07);
      vec3 grass = vec3(0.3, 0.36, 0.15);
      vec3 desert = vec3(0.66, 0.54, 0.34);
      vec3 rock = vec3(0.38, 0.33, 0.29);
      vec3 ground = mix(forest, grass, smoothstep(0.35, 0.7, moist));
      ground = mix(ground, desert, clamp(desertBelt * smoothstep(0.55, 0.3, moist) * 1.4, 0.0, 1.0));
      ground = mix(ground, rock, smoothstep(0.22, 0.38, h));
      ground = mix(ground, vec3(0.42, 0.44, 0.34), smoothstep(0.62, 0.8, lat));
      vec3 col = mix(ocean, ground, land);
      float ice = smoothstep(0.8, 0.86, lat + fbm(p * 5.0, 3) * 0.06);
      col = mix(col, vec3(0.92, 0.95, 0.98), ice);
      spec = (1.0 - land) * (1.0 - ice);
      // City lights on the night side, clustered on temperate land.
      float cities = smoothstep(0.55, 0.85, fbm(p * 24.0, 3) * 0.5 + 0.5) * land * (1.0 - ice) * smoothstep(0.75, 0.2, lat);
      night = cities * smoothstep(0.3, 0.7, moist + 0.2);
      return col;
    }`,
  mars: /* glsl */ `
    vec3 surface(vec3 p, out float spec, out float night) {
      spec = 0.0; night = 0.0;
      float n = fbm(p * 2.2, 6) * 0.5 + 0.5;
      float regions = fbm(p * 1.1 + 4.0, 4) * 0.5 + 0.5;
      vec3 rust = vec3(0.72, 0.33, 0.18);
      vec3 bright = vec3(0.85, 0.55, 0.36);
      vec3 dark = vec3(0.33, 0.16, 0.1);
      vec3 col = mix(rust, bright, smoothstep(0.45, 0.8, n));
      col = mix(col, dark, smoothstep(0.5, 0.72, regions + fbm(p * 4.0, 3) * 0.08) * 0.85);
      col *= 1.0 + craters(p, 6.0, 0.18) * 0.22 + craters(p, 16.0, 0.22) * 0.12;
      float lat = abs(p.y);
      float cap = smoothstep(0.88, 0.93, lat + fbm(p * 6.0, 3) * 0.05);
      return mix(col, vec3(0.95, 0.93, 0.9), cap);
    }`,
  jupiter: /* glsl */ `
    vec3 surface(vec3 p, out float spec, out float night) {
      spec = 0.0; night = 0.0;
      float lat = p.y;
      vec3 q = vec3(p.x * 2.2, p.y * 9.0, p.z * 2.2) + vec3(uTime * 0.015, 0.0, 0.0);
      float turb = fbm(q, 6);
      float bands = sin(lat * 22.0 + turb * 2.4) * 0.5 + 0.5;
      float fine = sin(lat * 61.0 + turb * 4.0) * 0.5 + 0.5;
      vec3 cream = vec3(0.92, 0.86, 0.74);
      vec3 tan = vec3(0.79, 0.62, 0.43);
      vec3 brown = vec3(0.52, 0.34, 0.22);
      vec3 col = mix(brown, tan, smoothstep(0.15, 0.6, bands));
      col = mix(col, cream, smoothstep(0.55, 0.95, bands) * 0.9);
      col *= 0.9 + fine * 0.12;
      col = mix(col, vec3(0.62, 0.66, 0.72), smoothstep(0.78, 0.97, abs(lat)) * 0.5);
      // Great Red Spot, about 22 degrees south.
      float lon = atan(p.z, p.x);
      vec2 d = vec2((lon - 1.2) * 1.9, (lat + 0.37) * 5.2);
      float spot = 1.0 - smoothstep(0.35, 0.6, length(d) + fbm(p * 14.0, 2) * 0.08);
      float swirl = sin(length(d) * 18.0 - atan(d.y, d.x) * 2.0) * 0.5 + 0.5;
      vec3 red = mix(vec3(0.66, 0.29, 0.18), vec3(0.8, 0.45, 0.3), swirl * 0.5);
      return mix(col, red, spot);
    }`,
  saturn: /* glsl */ `
    vec3 surface(vec3 p, out float spec, out float night) {
      spec = 0.0; night = 0.0;
      float lat = p.y;
      float turb = fbm(vec3(p.x * 2.0, p.y * 7.0, p.z * 2.0) + vec3(uTime * 0.01, 0.0, 0.0), 5);
      float bands = sin(lat * 18.0 + turb * 1.2) * 0.5 + 0.5;
      float fine = sin(lat * 47.0 + turb * 2.0) * 0.5 + 0.5;
      vec3 a = vec3(0.86, 0.76, 0.54);
      vec3 b = vec3(0.95, 0.89, 0.72);
      vec3 c = vec3(0.7, 0.58, 0.38);
      vec3 col = mix(a, b, smoothstep(0.3, 0.8, bands));
      col = mix(col, c, smoothstep(0.75, 1.0, fine) * 0.25);
      col = mix(col, vec3(0.62, 0.66, 0.6), smoothstep(0.82, 0.98, abs(lat)) * 0.45);
      return col;
    }`,
  uranus: /* glsl */ `
    vec3 surface(vec3 p, out float spec, out float night) {
      spec = 0.0; night = 0.0;
      float lat = p.y;
      float bands = sin(lat * 14.0 + fbm(p * vec3(2.0, 6.0, 2.0), 3) * 0.8) * 0.5 + 0.5;
      vec3 col = mix(vec3(0.6, 0.86, 0.9), vec3(0.72, 0.93, 0.95), bands * 0.35);
      col = mix(col, vec3(0.82, 0.96, 0.97), smoothstep(0.55, 0.95, lat) * 0.4);
      return col;
    }`,
  neptune: /* glsl */ `
    vec3 surface(vec3 p, out float spec, out float night) {
      spec = 0.0; night = 0.0;
      float lat = p.y;
      float turb = fbm(vec3(p.x * 2.5, p.y * 8.0, p.z * 2.5) + vec3(uTime * 0.03, 0.0, 0.0), 5);
      float bands = sin(lat * 16.0 + turb * 1.8) * 0.5 + 0.5;
      vec3 col = mix(vec3(0.13, 0.25, 0.68), vec3(0.24, 0.42, 0.88), bands);
      float lon = atan(p.z, p.x);
      vec2 d = vec2((lon + 0.8) * 2.2, (lat + 0.33) * 6.0);
      col = mix(col, vec3(0.07, 0.13, 0.42), (1.0 - smoothstep(0.25, 0.5, length(d))) * 0.85);
      float streaks = smoothstep(0.55, 0.85, fbm(vec3(p.x * 4.0, p.y * 30.0, p.z * 4.0) + 3.0, 4) * 0.5 + 0.5);
      return mix(col, vec3(0.85, 0.9, 1.0), streaks * 0.55 * smoothstep(0.1, 0.5, abs(lat)));
    }`,
};

export const PLANET_VERTEX = /* glsl */ `
varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
void main() {
  vObjPos = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export function planetFragment(id: PlanetId): string {
  return /* glsl */ `
uniform float uTime;
uniform vec3 uLightPos;
uniform float uHighlight;
uniform vec3 uRimColor;
varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
${NOISE}
${SURFACES[id]}
void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightPos - vWorldPos);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float spec, night;
  vec3 albedo = surface(vObjPos, spec, night);
  float ndl = dot(N, L);
  float diff = smoothstep(-0.08, 0.35, ndl) * max(ndl, 0.0) * 1.15 + max(ndl, 0.0) * 0.25;
  vec3 col = albedo * (diff + 0.018);
  vec3 H = normalize(L + V);
  col += spec * pow(max(dot(N, H), 0.0), 60.0) * 0.55 * smoothstep(0.0, 0.2, ndl) * vec3(1.0, 0.95, 0.85);
  col += night * smoothstep(0.05, -0.2, ndl) * vec3(1.0, 0.72, 0.38) * 0.9;
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  col += uRimColor * fres * smoothstep(-0.2, 0.5, ndl) * 0.35;
  col += uHighlight * (0.06 + fres * 0.5) * vec3(0.78, 1.0, 0.24);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
}

/** Cloud shell for Earth: lit, semi-transparent, drifting. */
export const CLOUDS_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uLightPos;
varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
${NOISE}
void main() {
  vec3 p = vObjPos;
  vec3 warp = vec3(fbm(p * 2.0 + uTime * 0.01, 3), fbm(p * 2.0 + 4.0, 3), 0.0) * 0.6;
  float c = fbm(p * vec3(3.0, 6.0, 3.0) + warp, 6) * 0.5 + 0.5;
  float a = smoothstep(0.52, 0.78, c) * 0.85;
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightPos - vWorldPos);
  float ndl = dot(N, L);
  float lit = smoothstep(-0.1, 0.4, ndl);
  gl_FragColor = vec4(vec3(1.0) * (lit * 0.95 + 0.02), a * (0.15 + 0.85 * lit));
  #include <colorspace_fragment>
}
`;

/** Back-face shell that glows at the lit limb. */
export const ATMOSPHERE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uLightPos;
uniform float uStrength;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
varying vec3 vObjPos;
void main() {
  // Rendered on back faces: brightest just outside the limb, fading to the shell edge.
  vec3 N = normalize(vWorldNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uLightPos - vWorldPos);
  float rim = pow(clamp(-dot(N, V), 0.0, 1.0), 1.6);
  float lit = smoothstep(-0.35, 0.55, dot(N, L));
  float a = rim * uStrength * (0.06 + 0.94 * lit);
  gl_FragColor = vec4(uColor * a, a);
  #include <colorspace_fragment>
}
`;

export const SUN_FRAGMENT = /* glsl */ `
uniform float uTime;
varying vec3 vObjPos;
varying vec3 vWorldNormal;
varying vec3 vWorldPos;
${NOISE}
void main() {
  vec3 p = vObjPos;
  float t = uTime * 0.05;
  float gran = worley(p * 22.0 + vec3(t)).x;
  float n = fbm(p * 3.0 + vec3(t * 0.6, -t, t * 0.3), 5) * 0.5 + 0.5;
  float spots = smoothstep(0.72, 0.8, fbm(p * 2.2 + 30.0, 4) * 0.5 + 0.5);
  float heat = clamp(n * 0.75 + (1.0 - gran) * 0.35 - spots * 0.6, 0.0, 1.2);
  vec3 col = mix(vec3(0.95, 0.3, 0.04), vec3(1.0, 0.66, 0.24), smoothstep(0.25, 0.75, heat));
  col = mix(col, vec3(1.0, 0.9, 0.62), smoothstep(0.82, 1.1, heat));
  vec3 V = normalize(cameraPosition - vWorldPos);
  float mu = max(dot(normalize(vWorldNormal), V), 0.0);
  float limb = 0.38 + 0.62 * pow(mu, 0.5);
  // Bright enough to bloom, dim enough to keep the granulation readable.
  gl_FragColor = vec4(col * limb * 1.35, 1.0);
}
`;

/** Camera-facing glow quad around the Sun. */
export const CORONA_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv * 2.0 - 1.0;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 scale = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  mv.xy += position.xy * scale;
  gl_Position = projectionMatrix * mv;
}
`;

export const CORONA_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uInner;
varying vec2 vUv;
${NOISE}
void main() {
  float r = length(vUv);
  float ang = atan(vUv.y, vUv.x);
  float streak = fbm(vec3(cos(ang) * 2.0, sin(ang) * 2.0, uTime * 0.05), 3) * 0.5 + 0.5;
  float falloff = pow(clamp(1.0 - (r - uInner) / (1.0 - uInner), 0.0, 1.0), 3.2);
  float glow = falloff * (0.45 + streak * 0.55) * smoothstep(uInner * 0.92, uInner * 1.02, r);
  // Everything fades to zero before the quad's edge, so no square shows.
  float halo = exp(-r * 4.0) * 0.3;
  float edge = 1.0 - smoothstep(0.55, 0.98, r);
  gl_FragColor = vec4(uColor * (glow + halo) * edge * 1.3, 1.0);
}
`;

/** Planetary rings with radial structure and the planet's shadow. */
export const RING_VERTEX = /* glsl */ `
varying vec3 vWorldPos;
varying vec2 vRing;
void main() {
  vRing = position.xy;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const RING_FRAGMENT = /* glsl */ `
uniform float uInner;
uniform float uOuter;
uniform vec3 uLightPos;
uniform vec3 uPlanetPos;
uniform float uPlanetRadius;
uniform vec3 uTint;
uniform float uFaint;
varying vec3 vWorldPos;
varying vec2 vRing;
${NOISE}
float band(float r) {
  float x = (r - uInner) / (uOuter - uInner);
  float d = 0.0;
  // C ring (faint), B ring (dense), Cassini division, A ring with Encke gap.
  d += smoothstep(0.0, 0.05, x) * (1.0 - smoothstep(0.24, 0.27, x)) * 0.28;
  d += smoothstep(0.26, 0.3, x) * (1.0 - smoothstep(0.6, 0.62, x)) * 0.95;
  d += smoothstep(0.66, 0.68, x) * (1.0 - smoothstep(0.97, 1.0, x)) * 0.62;
  d *= 1.0 - (smoothstep(0.885, 0.89, x) - smoothstep(0.895, 0.9, x)) * 0.9;
  d *= 0.75 + 0.35 * (snoise(vec3(x * 140.0, 0.0, 0.0)) * 0.5 + 0.5);
  return d;
}
void main() {
  float r = length(vRing);
  if (r < uInner || r > uOuter) discard;
  float density = uFaint > 0.5
    ? (smoothstep(0.86, 0.9, (r - uInner) / (uOuter - uInner)) - smoothstep(0.94, 0.98, (r - uInner) / (uOuter - uInner))) * 0.5
      + (snoise(vec3(r * 40.0, 0.0, 0.0)) > 0.55 ? 0.25 : 0.0)
    : band(r);
  // Shadow: does the ray towards the light hit the planet?
  vec3 L = normalize(uLightPos - vWorldPos);
  vec3 oc = vWorldPos - uPlanetPos;
  float b = dot(oc, L);
  float c = dot(oc, oc) - uPlanetRadius * uPlanetRadius;
  float shadow = (b < 0.0 && b * b - c > 0.0) ? 0.12 : 1.0;
  vec3 col = uTint * (0.35 + 0.75 * density) * shadow;
  gl_FragColor = vec4(col, clamp(density, 0.0, 1.0) * 0.92);
  #include <colorspace_fragment>
}
`;

export const STAR_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vTwinkle;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vTwinkle = 0.55 + 0.45 * sin(uTime * (0.6 + aPhase * 1.7) + aPhase * 40.0);
  vColor = aColor;
  gl_PointSize = aSize * uPixelRatio;
  gl_Position = projectionMatrix * mv;
}
`;

export const STAR_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vTwinkle;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  float a = smoothstep(0.5, 0.0, r);
  a = a * a;
  gl_FragColor = vec4(vColor * vTwinkle, a * vTwinkle);
}
`;
