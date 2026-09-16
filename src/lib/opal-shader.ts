// GLSL for the opal gem. WebGL 1 for reach (every iOS version that runs the
// PWA). One quad per gem; the fragment shader raymarches a rounded lozenge,
// lights it with two specular lobes, a Fresnel term and thin-film
// interference sampled per channel (chromatic aberration), and draws a soft
// halo outside the silhouette. Everything organic comes from 3D simplex noise.

export const OPAL_VERT = /* glsl */ `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`

export const OPAL_FRAG = /* glsl */ `
precision highp float;

varying vec2 v_uv;

uniform float u_time;     // seconds
uniform vec2  u_look;     // spring-smoothed lean toward the cursor, -1..1
uniform float u_bulge;    // 0..1 cursor proximity → surface bulge
uniform float u_tier;     // 1 = full day, 2 = full day + steps (warm palette)
uniform float u_seed;     // per-gem variation
uniform float u_ripple;   // seconds since tap, < 0 when idle
uniform vec2  u_rippleAt; // tap point in gem uv, -1..1
uniform float u_birth;    // seconds since mount (light sweep)
uniform float u_detail;   // 1 at demo size, down to ~0.3 for tracker tiles

// ── 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT) ──
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
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
  vec4 p = permute(permute(permute(
    i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
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
float fbm(vec3 p) {
  return 0.55 * snoise(p) + 0.3 * snoise(p * 2.1 + 3.7) + 0.15 * snoise(p * 4.3 - 1.9);
}

// ── palette: mint → sky → violet → gold → coral, cyclic ──
vec3 pal(float t) {
  t = fract(t);
  vec3 mint   = vec3(0.20, 0.98, 0.55);
  vec3 sky    = vec3(0.16, 0.58, 1.00);
  vec3 violet = vec3(0.62, 0.30, 1.00);
  vec3 gold   = vec3(1.00, 0.80, 0.32);
  vec3 coral  = vec3(1.00, 0.40, 0.52);
  float s = t * 5.0;
  vec3 c = mix(mint, sky, smoothstep(0.0, 1.0, s));
  c = mix(c, violet, smoothstep(1.0, 2.0, s));
  c = mix(c, gold, smoothstep(2.0, 3.0, s));
  c = mix(c, coral, smoothstep(3.0, 4.0, s));
  c = mix(c, mint, smoothstep(4.0, 5.0, s));
  return c;
}

mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
// GLSL ES 1.0 has no transpose(); for a rotation it is also the inverse
mat3 tr(mat3 m) {
  return mat3(m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]);
}

// ── the stone: an egg-ish ellipsoid that bulges toward the cursor ──
vec3 bulgeDir;
float sdGem(vec3 p) {
  // rounded pebble: a squashed sphere pushed around by low-frequency noise,
  // so no two stones share an outline
  vec3 r = vec3(0.76, 0.80, 0.58);
  r.y *= p.y > 0.0 ? 1.05 : 0.97;
  float lump = 0.06 * snoise(p * 1.5 + u_seed) + 0.015 * snoise(p * 3.2 - u_seed);
  r *= 1.0 + lump;
  float toward = max(dot(normalize(p + 1e-4), bulgeDir), 0.0);
  r *= 1.0 + u_bulge * 0.14 * toward * toward * toward;
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}
vec3 gemNormal(vec3 p) {
  vec2 e = vec2(0.004, 0.0);
  return normalize(vec3(
    sdGem(p + e.xyy) - sdGem(p - e.xyy),
    sdGem(p + e.yxy) - sdGem(p - e.yxy),
    sdGem(p + e.yyx) - sdGem(p - e.yyx)));
}

void main() {
  float t = u_time;
  // physics-flavoured float: noise drives a slow bob, sway and roll
  vec2 bob = 0.045 * vec2(snoise(vec3(u_seed, t * 0.23, 1.0)), snoise(vec3(u_seed + 9.0, t * 0.19, 5.0)));
  float sway = 0.18 * snoise(vec3(u_seed + 3.0, t * 0.11, 2.0));
  float roll = 0.10 * snoise(vec3(u_seed + 5.0, t * 0.13, 7.0));

  // spring-smoothed lean toward the cursor comes in through u_look
  mat3 R = rotY(u_look.x * 0.55 + sway) * rotX(-u_look.y * 0.45) * rotZ(roll);
  bulgeDir = normalize(vec3(u_look * 0.9, 0.8));

  // camera
  vec2 uv = v_uv - bob;
  vec3 ro = vec3(0.0, 0.0, 3.2);
  vec3 rd = normalize(vec3(uv * 0.62, -1.0));

  // raymarch, tracking closest approach for the halo
  float d = 0.0, nearest = 1e9;
  vec3 p = ro; bool hit = false;
  for (int i = 0; i < 56; i++) {
    p = ro + rd * d;
    float s = sdGem(R * p);
    nearest = min(nearest, s);
    if (s < 0.0015) { hit = true; break; }
    d += s * 0.9;
    if (d > 6.0) break;
  }

  vec3 warm = vec3(1.0, 0.86, 0.62);
  vec3 cool = vec3(0.55, 0.85, 1.0);
  float warmth = step(1.5, u_tier);
  vec3 haloTint = mix(cool, warm, warmth);

  // ripple from a tap: expanding ring that fades over ~1.5 s
  float rip = 0.0, ripHalo = 0.0;
  if (u_ripple >= 0.0) {
    float dist = length(v_uv - u_rippleAt);
    float wave = sin(dist * 11.0 - u_ripple * 9.5);
    rip = wave * exp(-u_ripple * 2.0) * exp(-dist * 1.2);
    ripHalo = exp(-u_ripple * 1.8);
  }
  // mount: a soft band of light crosses the stone once
  float sweep = 0.0;
  if (u_birth < 1.6) {
    float x = (v_uv.x + v_uv.y * 0.35) * 0.5 + 0.5;
    sweep = exp(-pow((x - (u_birth * 1.25 - 0.25)) * 4.5, 2.0)) * (1.0 - smoothstep(1.1, 1.6, u_birth));
  }

  if (!hit) {
    // halo: light leaking into the dark around the stone
    float glow = exp(-nearest * 8.0) * (mix(0.5, 0.3, u_detail) + 0.9 * ripHalo);
    glow *= 0.85 + 0.15 * snoise(vec3(uv * 3.0, t * 0.4));
    // and fade to exactly zero before the quad edge, so the draw area can
    // never show up as a square
    float edgeR = max(abs(v_uv.x), abs(v_uv.y));
    glow *= 1.0 - smoothstep(0.55, 0.95, edgeR);
    // straight alpha: colour is the tint, coverage is the glow
    gl_FragColor = vec4(haloTint, glow);
    return;
  }

  vec3 gp = R * p;
  vec3 n = normalize(tr(R) * gemNormal(gp));
  vec3 v = -rd;
  float NoV = max(dot(n, v), 0.0);

  // lights: key up-left, fill low-right, rim behind
  vec3 L1 = normalize(vec3(-0.55, 0.85, 0.75));
  vec3 L2 = normalize(vec3(0.8, -0.35, 0.55));
  vec3 L3 = normalize(vec3(0.2, 0.3, -1.0));
  float diff = 0.35 + 0.65 * max(dot(n, L1), 0.0) + 0.25 * max(dot(n, L2), 0.0);
  float spec1 = pow(max(dot(reflect(-L1, n), v), 0.0), 160.0);
  float spec2 = pow(max(dot(reflect(-L2, n), v), 0.0), 26.0) * 0.35;
  float rim   = pow(1.0 - NoV, 3.0) * max(dot(n, L3) * 0.5 + 0.5, 0.0);
  float F = 0.04 + 0.96 * pow(1.0 - NoV, 5.0);

  // ── material ──
  // thin-film interference: film thickness varies across the stone (noise),
  // phase depends on viewing angle; sample per channel with a slight offset
  // for chromatic aberration
  // small stones get coarser, punchier colour so the play still reads
  float fq = mix(0.5, 1.0, u_detail);
  vec3 np = gp + vec3(0.0, 0.0, t * 0.035);
  float thick = 0.5 + 0.5 * fbm(np * 1.9 * fq + u_seed);
  float phase = thick * 1.5 + (1.0 - NoV) * 1.2 + warmth * 0.45 + rip * 0.35;
  vec3 irid = vec3(pal(phase + 0.04).r, pal(phase).g, pal(phase - 0.04).b);
  // small stones: richer colour, since there are no pixels for subtlety
  float sat = 1.45;
  irid = mix(vec3(dot(irid, vec3(0.333))), irid, sat);

  // a second colour layer seen deeper inside the stone (offset along the
  // view direction) gives the flashes parallax and depth
  vec3 deep = gp + rd * 0.28;
  float thick2 = 0.5 + 0.5 * fbm(deep * 2.6 * fq - u_seed * 1.3 + vec3(t * 0.02));
  vec3 irid2 = pal(thick2 * 1.5 + 0.35 + (1.0 - NoV) * 0.6 + warmth * 0.45);

  // play-of-colour: large flowing cells, plus vein-like flow lines where
  // the colour bands meet, like the streaks in a crystal opal
  float cells = smoothstep(-0.45, 0.15, fbm(gp * 1.45 * fq + u_seed * 2.0));
  float veins = smoothstep(0.86, 0.985, 1.0 - abs(snoise(gp * 3.6 * fq + u_seed + vec3(0.0, t * 0.03, 0.0))));
  float cells2 = smoothstep(-0.15, 0.35, fbm(deep * 2.1 * fq + 9.0));
  // flashes strengthen as the surface turns away from the eye
  float tilt = 0.7 + 0.6 * pow(1.0 - NoV, 1.4);

  // glassy body: translucent, faintly milky, lit from within
  vec3 body = mix(vec3(0.84, 0.90, 0.97), vec3(0.97, 0.91, 0.82), warmth);
  vec3 col = body * (0.42 + 0.45 * diff) * 0.7;
  col = mix(col, irid2 * (0.7 + 0.35 * diff), cells2 * 0.7 * tilt);    // deep layer
  // small stones: colour everywhere, a touch darker so it doesn't wash to white
  col = mix(col, irid * (0.8 + 0.35 * diff), clamp(cells * 1.15 * tilt, 0.0, 1.0)); // surface layer
  col += irid * veins * 0.22 * tilt;                                        // flow lines
  col = mix(col, irid, 0.3 * F);                                            // grazing wash
  // milky haze over everything, thinner where the stone is thickest
  col = mix(col, vec3(0.94, 0.96, 0.99), 0.08 * (1.0 - NoV) + 0.04);

  // glass: a broad soft window reflection up-left, then two sharp speculars
  vec3 Lw = normalize(vec3(-0.35, 0.6, 0.85));
  float hl = 0.75;
  float windowR = pow(max(dot(reflect(-Lw, n), v), 0.0), 7.0) * 0.32 * hl;
  col += vec3(1.0) * windowR;
  col += (vec3(1.0) * spec1 * 1.2 + vec3(0.95, 0.97, 1.0) * spec2) * hl;
  col += haloTint * rim * 0.45;
  col += F * mix(vec3(0.8, 0.9, 1.0), warm, warmth) * 0.3 * hl;
  col += rip * 0.4 + sweep * 0.45;
  col += haloTint * 0.06 * (1.0 - NoV);                                     // inner glow

  // gentle tone map so stacked highlights roll off instead of clipping
  col = col / (1.0 + col * 0.22);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`
