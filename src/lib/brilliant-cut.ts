// The round brilliant cut as a convex set of facet planes, for the diamond
// shader to ray-trace. A port of the "custom cut" generator in
// piellardj/diamond-webgl (MIT): the stone is built from triangles over one
// 45° sector and replicated eight times, then coplanar triangles are merged
// into facets. Gem space: z is the stone's axis (table at the top, culet at
// the bottom), the girdle is the unit-diameter circle in z = 0.
//
// Proportions are the reference demo's defaults, which are the classic ideal
// brilliant: table 55% of the diameter, crown 15%, pavilion 43%.

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Facet {
  /** A point on the plane. */
  point: Vec3
  /** Unit normal, pointing out of the stone. */
  normal: Vec3
}

interface Triangle {
  p1: Vec3
  p2: Vec3
  p3: Vec3
}

export interface CutProportions {
  /** Height of the crown above the girdle, as a fraction of the diameter. */
  crownHeight: number
  /** Table width as a fraction of the diameter. */
  crownTable: number
  /** Where the bezel facets bend, 0 = at the girdle, 1 = at the table. */
  crownRatio: number
  /** Girdle height, as a fraction of the diameter. */
  girdleThickness: number
  /** Extra girdle facets per 22.5° sector; 0 keeps a 16-sided girdle. */
  girdleRoundness: number
  /** Depth of the pavilion below the girdle, as a fraction of the diameter. */
  pavilionHeight: number
  /** Where the lower-girdle facets meet the mains, 0 = at the girdle, 1 = at the culet. */
  pavilionRatio: number
}

export const IDEAL_BRILLIANT: CutProportions = {
  crownHeight: 0.152,
  crownTable: 0.551,
  crownRatio: 0.5,
  girdleThickness: 0.018,
  girdleRoundness: 0,
  pavilionHeight: 0.43,
  pavilionRatio: 0.77,
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v.x, v.y, v.z)
  return l > 0 ? { x: v.x / l, y: v.y / l, z: v.z / l } : { x: 1, y: 0, z: 0 }
}
const cylindric = (r: number, angle: number, z: number): Vec3 => ({
  x: r * Math.cos(angle),
  y: r * Math.sin(angle),
  z,
})
const rotateZ = (p: Vec3, angle: number): Vec3 => {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: c * p.x - s * p.y, y: s * p.x + c * p.y, z: p.z }
}
const triangleNormal = (t: Triangle): Vec3 =>
  normalize(cross(sub(t.p2, t.p1), sub(t.p3, t.p1)))
const planeFromTriangle = (t: Triangle): Facet => ({
  point: {
    x: (t.p1.x + t.p2.x + t.p3.x) / 3,
    y: (t.p1.y + t.p2.y + t.p3.y) / 3,
    z: (t.p1.z + t.p2.z + t.p3.z) / 3,
  },
  normal: triangleNormal(t),
})
/** Where the vertical line through `p` meets `plane`. */
const liftOnto = (p: Vec3, plane: Facet): Vec3 => {
  const up = { x: 0, y: 0, z: 1 }
  const denom = dot(up, plane.normal)
  if (denom === 0) return p
  const t = dot(sub(plane.point, p), plane.normal) / denom
  return { x: p.x, y: p.y, z: p.z + t }
}
const inPlane = (plane: Facet, p: Vec3): boolean =>
  Math.abs(dot(plane.normal, sub(p, plane.point))) < 0.001

/** Triangles of one 45° sector, replicated eight times. */
function buildTriangles(c: CutProportions): Triangle[] {
  const r = 0.5
  const n = c.pavilionHeight
  const t = c.pavilionRatio
  const o = c.girdleThickness
  const i = c.girdleRoundness
  const u = c.crownHeight
  const f = c.crownRatio
  const table = c.crownTable
  const s = o + u
  const SECTOR = (2 * Math.PI) / 8
  const HALF = SECTOR / 2

  const culet: Vec3 = { x: 0, y: 0, z: -n }
  // where the lower-girdle facets meet the pavilion mains
  const v = cylindric(((1 - t) * r) / Math.cos(HALF), SECTOR, -n * t)
  const h = rotateZ(v, -SECTOR)
  // girdle, bottom edge
  const d = cylindric(r, SECTOR, 0)
  const m = cylindric(r, HALF, 0)
  const g = cylindric(r, 0, 0)
  // girdle, top edge
  const p = { x: d.x, y: d.y, z: o }
  const b = { x: m.x, y: m.y, z: o }
  const M = { x: g.x, y: g.y, z: o }
  // where the bezels meet the upper-girdle facets
  const y = cylindric((0.5 * (1 - f + f * table)) / Math.cos(HALF), SECTOR, o + f * u)
  const x = rotateZ(y, -SECTOR)
  // table corners and centre
  const P = cylindric(0.5 * table, HALF, s)
  const T = cylindric(0.5 * table, -HALF, s)
  const R: Vec3 = { x: 0, y: 0, z: s }

  const lowerA = planeFromTriangle({ p1: h, p2: m, p3: g })
  const lowerB = planeFromTriangle({ p1: v, p2: d, p3: m })
  const upperA = planeFromTriangle({ p1: b, p2: x, p3: M })
  const upperB = planeFromTriangle({ p1: p, p2: y, p3: b })

  const out: Triangle[] = []
  for (let side = 0; side < 2; side++) {
    const lower = side === 0 ? lowerA : lowerB
    const upper = side === 0 ? upperA : upperB
    const apexDown = side === 0 ? h : v
    const apexUp = side === 0 ? x : y
    const segments = i + 2
    const step = HALF / (segments - 1)
    const from = side * HALF
    for (let k = 0; k < segments - 1; k++) {
      const a0 = from + k * step
      const a1 = a0 + step
      const V = liftOnto(cylindric(r, a0, 0), lower)
      const G = liftOnto(cylindric(r, a1, 0), lower)
      const K = liftOnto(cylindric(r, a0, 0), upper)
      const U = liftOnto(cylindric(r, a1, 0), upper)
      out.push({ p1: apexDown, p2: G, p3: V }) // lower-girdle facet
      out.push({ p1: G, p2: K, p3: V }) // girdle
      out.push({ p1: G, p2: U, p3: K }) // girdle
      out.push({ p1: apexUp, p2: K, p3: U }) // upper-girdle facet
    }
  }
  out.push({ p1: culet, p2: m, p3: h }) // pavilion main
  out.push({ p1: culet, p2: v, p3: m })
  out.push({ p1: P, p2: R, p3: T }) // table
  out.push({ p1: P, p2: T, p3: x }) // star
  out.push({ p1: b, p2: P, p3: x }) // bezel
  out.push({ p1: b, p2: y, p3: P })

  const sector = out.length
  for (let k = 1; k < 8; k++) {
    const a = k * SECTOR
    for (let j = 0; j < sector; j++) {
      out.push({
        p1: rotateZ(out[j].p1, a),
        p2: rotateZ(out[j].p2, a),
        p3: rotateZ(out[j].p3, a),
      })
    }
  }
  return out
}

/** Merge coplanar triangles into facets; normals face out of the stone. */
export function buildBrilliant(c: CutProportions = IDEAL_BRILLIANT): Facet[] {
  const triangles = buildTriangles(c)
  const facets: Facet[] = []
  for (const t of triangles) {
    if (facets.some((f) => inPlane(f, t.p1) && inPlane(f, t.p2) && inPlane(f, t.p3))) continue
    facets.push(planeFromTriangle(t))
  }
  // Orient every normal away from the stone's interior, whatever the
  // triangle winding was.
  const inside: Vec3 = { x: 0, y: 0, z: (c.girdleThickness + c.crownHeight - c.pavilionHeight) / 2 }
  for (const f of facets) {
    if (dot(f.normal, sub(inside, f.point)) > 0) {
      f.normal = { x: -f.normal.x, y: -f.normal.y, z: -f.normal.z }
    }
  }
  // Every vertex must lie inside (or on) every facet plane, or the stone
  // isn't convex and the ray-tracer's exit test breaks down.
  for (const t of triangles) {
    for (const p of [t.p1, t.p2, t.p3]) {
      for (const f of facets) {
        if (dot(f.normal, sub(p, f.point)) > 0.001) {
          throw new Error("brilliant cut is not convex")
        }
      }
    }
  }
  return facets
}
