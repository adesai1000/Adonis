// GLSL for the diamond stones in the consistency tracker. WebGL 1 / GLSL ES
// 1.0 for reach (every iOS version that runs the PWA). One quad per stone;
// the fragment shader ray-traces a round brilliant cut the way
// piellardj/diamond-webgl does: the stone is a convex set of facet planes,
// the eye ray refracts in, bounces between facets with a Fresnel split and
// Beer absorption, and every exit ray samples a procedural sky. Dispersion
// splits the exit rays per colour channel, which is where the fire comes
// from.
//
// Uniform contract (set per stone, per frame, by DiamondField):
//   u_time     seconds since mount, plus a per-stone offset
//   u_tilt     spring-smoothed lean toward the pointer, -1..1 (x right, y up)
//   u_spin     extra yaw from tap impulses, radians (accumulates)
//   u_seed     any number; per-stone variation (initial orientation etc.)
//   u_birth    seconds since this stone's (staggered) arrival
//   u_absorb   Beer absorption per channel; the stone's body colour
//   u_exposure sky brightness
//   u_dark     1 on a dark card, 0 on a light one
//   u_fire     dispersion, as a spread of the refractive index
//   u_depth    internal bounces to trace
//   u_rim      how much the silhouette darkens, for stones on a light card
//
// Framing: the quad spans the cell plus a pad of DIAMOND_PAD × size on every
// side (see diamond-field.tsx), so the cell is |v_uv| <= CELL. The stone is
// seen from a little above the girdle, like a stone photographed on a
// table: crown on top, pavilion below.
//
// Output: premultiplied alpha. Outside the stone alpha is exactly 0, so the
// quad never shows.

import { buildBrilliant, IDEAL_BRILLIANT } from "./brilliant-cut"

export const DIAMOND_VERT = /* glsl */ `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

/** Draw area around each stone, as a fraction of its size on every side. */
export const DIAMOND_PAD = 0.3
/** Half the cell, in quad uv (the quad is -1..1). */
const CELL = 1 / (1 + 2 * DIAMOND_PAD)
/** How much of the cell the girdle spans at rest. */
const GIRDLE_SPAN = 1.0
/** Most internal bounces traced before the remaining light is let out. */
const RAY_DEPTH = 7
/** Camera: field of view (tan of the half angle) and distance to the stone. */
const TAN_HALF_FOV = 0.24
const CAM_DIST = 0.5 / (TAN_HALF_FOV * GIRDLE_SPAN * CELL)
/** Where the stone's centre sits in the cell (uv, up is positive). */
const STONE_LIFT = 0.0

const FACETS = buildBrilliant(IDEAL_BRILLIANT)
const f6 = (n: number) => (Object.is(n, -0) ? 0 : n).toFixed(6)

/** Number of facet planes the shader loops over. */
export const FACET_COUNT = FACETS.length
/**
 * The facets as plane equations for the u_facets uniform array: xyz is the
 * outward unit normal, w is the plane's offset along it (dot(p, n) = w on
 * the plane). Uploaded once per program.
 */
export const FACET_DATA = new Float32Array(
  FACETS.flatMap((f) => [
    f.normal.x,
    f.normal.y,
    f.normal.z,
    f.normal.x * f.point.x + f.normal.y * f.point.y + f.normal.z * f.point.z,
  ])
)

export const DIAMOND_FRAG = /* glsl */ `
#define NF ${FACET_COUNT}
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 v_uv;

uniform float u_time;
uniform vec2  u_tilt;
uniform float u_spin;
uniform float u_seed;
uniform float u_birth;
uniform vec3  u_absorb;
uniform float u_exposure;
uniform float u_dark;
uniform float u_fire;     // dispersion, as a spread of the refractive index
uniform int   u_depth;    // bounces to trace, <= DEPTH
uniform float u_rim;      // how much the silhouette darkens on a light card
uniform vec4  u_facets[NF];

const float PI = 3.14159265;
const float CELL = ${f6(CELL)};
const float CAM_DIST = ${f6(CAM_DIST)};
const float TAN_HALF_FOV = ${f6(TAN_HALF_FOV)};
const float STONE_LIFT = ${f6(STONE_LIFT)};
const float IOR = 2.42;
const int DEPTH = ${RAY_DEPTH};

// Exit: the nearest facet the ray leaves through, among those facing away.
float exitDist(vec3 pos, vec3 dir, out vec3 nx) {
  // sentinels stay inside half-float range for a mediump fallback
  float t = 1e4;
  nx = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < NF; i++) {
    vec4 f = u_facets[i];
    float b = dot(dir, f.xyz);
    if (b > 0.0) {
      float ti = (f.w - dot(pos, f.xyz)) / b;
      if (ti < t) { t = ti; nx = f.xyz; }
    }
  }
  return t;
}

// Entry: slab test against every facet; the ray is inside the stone between
// the last plane it enters and the first plane it leaves.
bool entry(vec3 ro, vec3 rd, out float tN, out vec3 nN) {
  float tNear = -1e4, tFar = 1e4;
  nN = vec3(0.0, 0.0, 1.0);
  for (int i = 0; i < NF; i++) {
    vec4 f = u_facets[i];
    float b = dot(rd, f.xyz);
    float s = f.w - dot(ro, f.xyz);
    if (b < 0.0) {
      float ti = s / b;
      if (ti > tNear) { tNear = ti; nN = f.xyz; }
    } else if (b > 0.0) {
      tFar = min(tFar, s / b);
    } else if (s < 0.0) {
      return false;
    }
  }
  tN = tNear;
  return tNear <= tFar && tNear > 0.0;
}

// ── light ──
// The sky is the reference's "random" environment: bright bands from the
// sides, darker below, and a dark disc straight above where the viewer's
// head blocks the light. The last one is what draws the dark arrows in the
// pavilion. Directions are in stone space with the spin taken out, so the
// light stays put while the stone turns through it.
float sky(vec3 d) {
  float monoX = 0.4 + 0.6 * abs(cos(6.0 * (d.x + 0.1)));
  float monoY = 0.5 * cos(7.0 * (d.y + 0.5 * d.x + 0.1));
  float monoZ = 0.5 * cos(5.0 * (d.z + 0.3));
  float pure = monoX + monoY + monoZ;
  // below the stone: dim on a dark card, but a white card is a light source
  float value = mix(mix(1.05, 0.7, u_dark), pure, smoothstep(-1.0, 0.2, d.z));
  value = 1.2 * clamp(value, 0.7, 1.5);
  float headShadow = max(0.2, step(d.z, 0.98));
  return headShadow * value * u_exposure;
}

// Fresnel split between the reflected and transmitted ray at a facet.
// n faces the incident ray; eta is the ratio of the indices being crossed;
// critCos is the cosine of the critical angle (1 = no total reflection).
float fresnel(vec3 incident, vec3 n, vec3 refracted, float eta, float critCos) {
  float cosI = abs(dot(n, incident));
  if (cosI < critCos) return 1.0;
  float cosT = abs(dot(n, refracted));
  float a = (cosI - eta * cosT) / (cosI + eta * cosT);
  float b = (eta * cosI - cosT) / (eta * cosI + cosT);
  return 0.5 * (a * a + b * b);
}

mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
// GLSL ES 1.0 has no transpose(); for a rotation it is also the inverse
mat3 tr(mat3 m) {
  return mat3(m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]);
}

// Light leaving the stone along a ray that starts at pos on the surface
// heading into the stone, per colour channel. unspin maps stone space to
// sky space.
vec3 trace(vec3 pos, vec3 dir, mat3 unspin, int depth) {
  float critCos = sqrt(max(0.0, 1.0 - 1.0 / (IOR * IOR)));
  vec3 ior = vec3(IOR - 0.5 * u_fire, IOR, IOR + 0.5 * u_fire);
  vec3 col = vec3(0.0);
  float energy = 1.0;
  float travelled = 0.0;
  vec3 nx;
  for (int i = 0; i < DEPTH; i++) {
    if (i >= depth) break;
    float t = exitDist(pos, dir, nx);
    vec3 outG = refract(dir, -nx, IOR);
    float F = fresnel(dir, -nx, outG, IOR, critCos);
    travelled += t;
    if (F < 1.0) {
      // the exit ray fans out by wavelength: that is the fire
      vec3 outR = refract(dir, -nx, ior.r);
      vec3 outB = refract(dir, -nx, ior.b);
      // blue bends more, so it can be totally reflected where green still
      // gets out; refract() then returns zero, and no light leaves for it
      float blueOut = step(0.5, dot(outB, outB));
      vec3 seen = vec3(sky(unspin * outR), sky(unspin * outG), sky(unspin * outB) * blueOut);
      col += energy * (1.0 - F) * seen * exp(-u_absorb * travelled);
    }
    energy *= F;
    if (energy < 0.002) return col;
    pos += t * dir;
    dir = reflect(dir, nx);
  }
  // what is still bouncing around gets out eventually; let half of it go
  col += energy * 0.5 * sky(unspin * dir) * exp(-u_absorb * travelled);
  return col;
}

// Colour of the stone where the ray ro + t rd (stone space) hits it.
vec3 shade(vec3 ro, vec3 rd, float t, vec3 n, mat3 unspin, int depth) {
  vec3 hit = ro + t * rd;
  vec3 inside = refract(rd, n, 1.0 / IOR);
  float F = fresnel(rd, n, inside, 1.0 / IOR, 0.0);
  vec3 body = trace(hit, inside, unspin, depth);
  float mirror = sky(unspin * reflect(rd, n));
  vec3 col = mix(body, vec3(mirror), F);
  // on a light card a white stone's silhouette needs help: the girdle and
  // the facets turning away go a little darker, as on a stone on white paper
  float rim = mix(0.5, 1.0, smoothstep(0.0, 0.5, abs(dot(n, rd))));
  return col * mix(1.0, rim, u_rim);
}

float easeOut(float x) { x = clamp(x, 0.0, 1.0); return 1.0 - (1.0 - x) * (1.0 - x) * (1.0 - x); }

void main() {
  // ── orientation ──
  // the stone turns slowly on its axis; a tap gives it a shove; on arrival
  // it swings in through a quarter turn
  float idle = u_time * 0.12 + u_seed * 1.7;
  float arrive = (1.0 - easeOut(u_birth / 0.9)) * 1.4;
  float spin = idle + u_spin + arrive;
  // seen from a little above the girdle; the pointer leans it further
  float elev = radians(28.0) + u_tilt.y * radians(11.0) + sin(u_time * 0.31 + u_seed) * radians(2.5);
  float yaw = u_tilt.x * radians(22.0);
  // stone → view
  mat3 M = rotY(yaw) * rotX(-(0.5 * PI - elev)) * rotZ(spin);
  mat3 Mi = tr(M);
  // stone → sky: the spin taken back out (M applies rotZ(spin) first, so a
  // stone-space direction needs rotZ(spin) to land in the unspun frame)
  mat3 unspin = rotZ(spin);

  // ── camera ──
  vec2 uv = v_uv - vec2(0.0, STONE_LIFT);
  vec3 roV = vec3(0.0, 0.0, CAM_DIST);
  vec3 rdV = normalize(vec3(uv * TAN_HALF_FOV, -1.0));
  vec3 ro = Mi * roV;
  vec3 rd = Mi * rdV;

  float fade = clamp(u_birth / 0.25, 0.0, 1.0);

  float t;
  vec3 n;
  if (!entry(ro, rd, t, n)) {
    gl_FragColor = vec4(0.0);
    return;
  }
  vec3 col = shade(ro, rd, t, n, unspin, u_depth) * fade;
  gl_FragColor = vec4(col, fade);
}
`

// ── post: edge smoothing over the traced stones ──
// Second pass, one quad per stone again, reading the first pass's texture:
// the reference's one-pass FXAA on the facet edges, which the ray-tracer
// leaves jagged. On a supersampled slot the taps land between texels, so
// the bilinear fetch is also the 2×2 box filter.

export const POST_VERT = /* glsl */ `
attribute vec2 a_pos;
uniform vec4 u_rect; // this stone's quad in texture uv: x, y, w, h
varying vec2 v_tex;
void main() {
  v_tex = u_rect.xy + (a_pos * 0.5 + 0.5) * u_rect.zw;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

export const POST_FRAG = /* glsl */ `
// texture coordinates into a large atlas need more than half-float precision
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

varying vec2 v_tex;
uniform sampler2D u_tex;
uniform vec2  u_texel;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

// Find which neighbours look like this pixel, read the edge direction off
// that, blur along it.
void main() {
  vec4 topLeft     = texture2D(u_tex, v_tex + vec2(-1.0, -1.0) * u_texel);
  vec4 top         = texture2D(u_tex, v_tex + vec2( 0.0, -1.0) * u_texel);
  vec4 topRight    = texture2D(u_tex, v_tex + vec2( 1.0, -1.0) * u_texel);
  vec4 left        = texture2D(u_tex, v_tex + vec2(-1.0,  0.0) * u_texel);
  vec4 middle      = texture2D(u_tex, v_tex);
  vec4 right       = texture2D(u_tex, v_tex + vec2( 1.0,  0.0) * u_texel);
  vec4 bottomLeft  = texture2D(u_tex, v_tex + vec2(-1.0,  1.0) * u_texel);
  vec4 bottom      = texture2D(u_tex, v_tex + vec2( 0.0,  1.0) * u_texel);
  vec4 bottomRight = texture2D(u_tex, v_tex + vec2( 1.0,  1.0) * u_texel);
  float l = luma(middle.rgb) + middle.a;
  const float T = 0.06;
  float tl = step(abs(luma(topLeft.rgb) + topLeft.a - l), T);
  float tt = step(abs(luma(top.rgb) + top.a - l), T);
  float tr = step(abs(luma(topRight.rgb) + topRight.a - l), T);
  float ll = step(abs(luma(left.rgb) + left.a - l), T);
  float rr = step(abs(luma(right.rgb) + right.a - l), T);
  float bl = step(abs(luma(bottomLeft.rgb) + bottomLeft.a - l), T);
  float bb = step(abs(luma(bottom.rgb) + bottom.a - l), T);
  float br = step(abs(luma(bottomRight.rgb) + bottomRight.a - l), T);
  vec2 gradient = abs(vec2((tl + ll + bl) - (tr + rr + br), (tl + tt + tr) - (bl + bb + br)));
  if (gradient.y > gradient.x) { gl_FragColor = 0.5 * middle + 0.25 * (left + right); return; }
  if (gradient.y < gradient.x) { gl_FragColor = 0.5 * middle + 0.25 * (top + bottom); return; }
  gl_FragColor = middle;
}
`
