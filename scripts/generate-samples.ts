import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Module, { type Manifold } from 'manifold-3d'
import { sampleManifestSchema, type SampleEntry } from '../src/core/samples/manifest'

const OUT_DIR = fileURLToPath(new URL('../public/samples/', import.meta.url))
const MM_PER_INCH = 25.4

const wasm = await Module()
wasm.setup()
const M = wasm.Manifold

// Axis aligned box from min and max corners.
const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Manifold =>
  M.cube([x1 - x0, y1 - y0, z1 - z0]).translate([x0, y0, z0])

// Solids that overlap by 1 mm before a union, so the boolean never depends on exactly coplanar contact.
// The overlap is hidden inside the other solid: the unioned surface is the nominal one.

function tJoint(): { merged: Manifold; plate: Manifold; webOnPlate: Manifold } {
  const plate = box(-100, 100, -60, 60, 0, 10)
  const webOnPlate = box(-100, 100, -5, 5, 10, 90)
  const merged = M.union(plate, box(-100, 100, -5, 5, 9, 90))
  return { merged, plate, webOnPlate }
}

function lBracket(): Manifold {
  const base = box(0, 120, 0, 80, 0, 8)
  const upright = box(0, 120, 0, 8, 0, 80)
  // Triangular gusset, legs 50 mm along the base and the upright, 8 mm thick.
  // The triangle is sunk 1 mm into both plates; its hypotenuse plane (y + z = 66) is the nominal one.
  const gusset = (x0: number): Manifold =>
    M.hull([
      [x0, 7, 7],
      [x0, 59, 7],
      [x0, 7, 59],
      [x0 + 8, 7, 7],
      [x0 + 8, 59, 7],
      [x0 + 8, 7, 59],
    ])
  return M.union([base, upright, gusset(20), gusset(56), gusset(92)])
}

function boxGirder(): Manifold {
  const bottomFlange = box(0, 600, -100, 100, 0, 12)
  const topFlange = box(0, 600, -100, 100, 188, 200)
  const webLeft = box(0, 600, -75, -65, 11, 189)
  const webRight = box(0, 600, 65, 75, 11, 189)
  return M.union([bottomFlange, topFlange, webLeft, webRight])
}

function pipeOnPlate(): Manifold {
  const plate = box(-75, 75, -75, 75, 0, 10)
  const outer = M.cylinder(61, 25, 25, 96)
  const bore = M.cylinder(63, 19, 19, 96).translate([0, 0, -1])
  const pipe = outer.subtract(bore).translate([0, 0, 9])
  return M.union(plate, pipe)
}

// A solid round bar through a plate, two separate bodies (a hollow pipe would add two bore loops).
function barThroughPlate(): Manifold[] {
  const plate = box(-75, 75, -75, 75, 0, 10)
  const bar = M.cylinder(60, 25, 25, 96).translate([0, 0, -25])
  return [plate, bar]
}

function doubleBottomCell(): Manifold[] {
  const bottom = box(0, 800, 0, 500, 0, 12)
  const innerBottom = box(0, 800, 0, 500, 112, 124)
  const girders = [box(0, 800, 165, 175, 12, 112), box(0, 800, 325, 335, 12, 112)]
  const floors = [200, 400, 600].map((x) =>
    M.union(box(x - 4, x + 4, 175, 325, 12, 112), box(x + 3, x + 44, 175, 325, 56, 64)),
  )
  return [bottom, innerBottom, ...girders, ...floors]
}

// Closed 8 mm tank, 1600 x 1000 x 1000 mm outside, as six bodies: the shell (one body, so its inside corners are
// crease seams), two transverse and two longitudinal stiffeners standing on the floor, and a coaming ring on the roof.
function tankWithManhole(): Manifold[] {
  const SEGMENTS = 64
  const hole = (r: number, z0: number, z1: number): Manifold =>
    M.cylinder(z1 - z0, r, r, SEGMENTS).translate([400, 500, z0])
  const shell = box(0, 1600, 0, 1000, 0, 1000)
    .subtract(box(8, 1592, 8, 992, 8, 992))
    .subtract(hole(300, 990, 1010))
  const transverse = [746, 1146].map((x) => box(x, x + 8, 68, 932, 8, 408))
  const longitudinal = [331, 661].map((y) => box(814, 1086, y, y + 8, 8, 338))
  const coaming = hole(308, 1000, 1050).subtract(hole(302, 999, 1051))
  return [shell, ...transverse, ...longitudinal, coaming]
}

// 1 in square tube with a 1/8 in wall along one axis, from a to b, centred on (c1, c2) in the other two axes in
// increasing axis order. Open at both ends, as cut from stock.
function squareTube(axis: 0 | 1 | 2, a: number, b: number, centre: [number, number]): Manifold {
  const SIDE = 25.4
  const WALL = 3.18
  const outer: number[][] = []
  const inner: number[][] = []
  let other = 0
  for (let c = 0; c < 3; c++) {
    if (c === axis) {
      outer.push([a, b])
      inner.push([a - 1, b + 1])
    } else {
      const mid = centre[other++]!
      outer.push([mid - SIDE / 2, mid + SIDE / 2])
      inner.push([mid - SIDE / 2 + WALL, mid + SIDE / 2 - WALL])
    }
  }
  const [x, y, z] = outer as [number[], number[], number[]]
  const [ix, iy, iz] = inner as [number[], number[], number[]]
  return box(x[0]!, x[1]!, y[0]!, y[1]!, z[0]!, z[1]!).subtract(box(ix[0]!, ix[1]!, iy[0]!, iy[1]!, iz[0]!, iz[1]!))
}

// Ladder frame 600 x 300 mm: two rails along x and three rungs along y butting the rails' inner faces, five separate
// bodies. Rung and rail are the same tube, so the top and bottom of each rung end lie flush with the rail.
function tubeFrame(): Manifold[] {
  const rails = [12.7, 287.3].map((y) => squareTube(0, 0, 600, [y, 12.7]))
  const rungs = [50, 300, 550].map((x) => squareTube(1, 25.4, 274.6, [x, 12.7]))
  return [...rails, ...rungs]
}

// The same frame as one solid: the ladder outline extruded, so a flush side has no vertex or sliver on it, and the bores
// cut after. The rails close the rung bores, so each is a shell of its own, as CAD writes a closed cavity.
function tubeFrameFused(): Manifold[] {
  const [SIDE, WALL] = [25.4, 3.18]
  const [Y0, Y1] = [SIDE, 300 - SIDE]
  // A tenth off the frame of separate tubes: at 50 the edge from a rail end to a rung has its centre at 18.65 mm,
  // on a 0.1 mm step of the seam id, where the float noise of a part far from the origin flips it.
  const rungs = [50.1, 300.1, 550.1]
  // The windows between the rails and the rungs: clockwise, so that they are holes in the outline.
  const stops = [0, ...rungs.flatMap((x) => [x - SIDE / 2, x + SIDE / 2]), 600]
  const windows = rungs.concat(600).map((_, k): [number, number][] => {
    const [x0, x1] = [stops[k * 2]!, stops[k * 2 + 1]!]
    return [[x0, Y0], [x0, Y1], [x1, Y1], [x1, Y0]]
  })
  const frame = M.extrude([[[0, 0], [600, 0], [600, 300], [0, 300]], ...windows], SIDE)
  const railBores = [[WALL, SIDE - WALL], [300 - SIDE + WALL, 300 - WALL]].map(([y0, y1]) => box(-1, 601, y0!, y1!, WALL, SIDE - WALL))
  const rungBores = rungs.map((x) => box(x - SIDE / 2 + WALL, x + SIDE / 2 - WALL, Y0, Y1, WALL, SIDE - WALL))
  // The frame first, by far the most triangles, and then the cavities.
  return M.difference([frame, ...railBores, ...rungBores])
    .decompose()
    .sort((a, b) => b.numTri() - a.numTri())
}

type Soup = number[]

type Flip = (solid: number, centroid: number[], normal: number[]) => boolean

// flip reverses the winding of the triangles it selects, which is how a CAD export ends up with flipped normals.
function toSoup(solids: Manifold[], flip?: Flip): Soup {
  const soup: Soup = []
  solids.forEach((solid, index) => {
    if (solid.decompose().length !== 1) throw new Error('A sample solid is not a single connected body.')
    const { numProp, vertProperties, triVerts } = solid.getMesh()
    for (let t = 0; t < triVerts.length; t += 3) {
      const tri = [0, 1, 2].map((k) => [0, 1, 2].map((c) => vertProperties[triVerts[t + k]! * numProp + c]!))
      const [a, b, c] = tri as [number[], number[], number[]]
      const u = [0, 1, 2].map((i) => b[i]! - a[i]!)
      const v = [0, 1, 2].map((i) => c[i]! - a[i]!)
      const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
      const len = Math.hypot(n[0]!, n[1]!, n[2]!) || 1
      const centroid = [0, 1, 2].map((i) => (a[i]! + b[i]! + c[i]!) / 3)
      const reversed = flip?.(index, centroid, n.map((x) => x / len)) ?? false
      soup.push(...a, ...(reversed ? c : b), ...(reversed ? b : c))
    }
  })
  return soup
}

function faceNormal(s: Soup, t: number): [number, number, number] {
  const o = t * 9
  const ux = s[o + 3]! - s[o]!
  const uy = s[o + 4]! - s[o + 1]!
  const uz = s[o + 5]! - s[o + 2]!
  const vx = s[o + 6]! - s[o]!
  const vy = s[o + 7]! - s[o + 1]!
  const vz = s[o + 8]! - s[o + 2]!
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz)
  return len === 0 ? [0, 0, 0] : [nx / len, ny / len, nz / len]
}

function binaryStl(id: string, soup: Soup): Buffer {
  const count = soup.length / 9
  const out = Buffer.alloc(84 + 50 * count)
  out.write(`weld-seam-planner sample ${id}`.padEnd(80, ' '), 0, 'latin1')
  out.writeUInt32LE(count, 80)
  for (let t = 0; t < count; t++) {
    let o = 84 + 50 * t
    for (const c of faceNormal(soup, t)) o = out.writeFloatLE(c, o)
    for (let i = 0; i < 9; i++) o = out.writeFloatLE(soup[t * 9 + i]!, o)
  }
  return out
}

function asciiStl(id: string, soup: Soup): Buffer {
  const num = (x: number) => x.toPrecision(9)
  const lines = [`solid ${id}`]
  for (let t = 0; t < soup.length / 9; t++) {
    lines.push(`  facet normal ${faceNormal(soup, t).map(num).join(' ')}`, '    outer loop')
    for (let v = 0; v < 3; v++) {
      lines.push(`      vertex ${[0, 1, 2].map((c) => num(soup[t * 9 + v * 3 + c]!)).join(' ')}`)
    }
    lines.push('    endloop', '  endfacet')
  }
  lines.push(`endsolid ${id}`, '')
  return Buffer.from(lines.join('\n'), 'latin1')
}

interface Sample extends SampleEntry {
  soup: Soup
  ascii: boolean
}

type Counted = 'expectedContactSeams' | 'expectedIntersectionSeams' | 'expectedHollowSeams'

function sample(
  fields: Omit<SampleEntry, 'file' | 'bodies' | Counted> &
    Partial<Pick<SampleEntry, Counted>> & { solids: Manifold[]; scale?: number; ascii?: boolean; flip?: Flip },
): Sample {
  const { solids, scale = 1, ascii = false, flip, expectedContactSeams = 0, expectedIntersectionSeams = 0, expectedHollowSeams = 0, ...entry } = fields
  return {
    ...entry,
    expectedContactSeams,
    expectedIntersectionSeams,
    expectedHollowSeams,
    file: `${entry.id}.stl`,
    bodies: solids.length,
    soup: toSoup(solids, flip).map((x) => x * scale),
    ascii,
  }
}

const tj = tJoint()

const samples: Sample[] = [
  sample({
    id: 't-joint-merged',
    name: 'T-joint (merged)',
    description: 'T-joint as one merged body: plate and web fused, two concave seams',
    units: 'mm',
    solids: [tj.merged],
    expectedCreaseSeams: 2 * 1, // 2 web sides x 1 concave line (web to plate top, 200 mm) = 2
  }),
  sample({
    id: 't-joint-assembly',
    name: 'T-joint (assembly)',
    description: 'T-joint as two separate touching bodies: two contact seams, the same as the merged T-joint',
    units: 'mm',
    solids: [tj.plate, tj.webOnPlate],
    expectedCreaseSeams: 0, // two separate boxes, every edge convex = 0
    // 2 web bottom edges (200 mm) lie on the plate top = 2; the two 10 mm end edges are flush with the plate ends
    expectedContactSeams: 2 * 1,
  }),
  sample({
    id: 't-joint-inch',
    name: 'T-joint (inch)',
    description: 'T-joint modelled in inches: triggers the units prompt',
    units: 'in',
    solids: [tj.merged],
    scale: 1 / MM_PER_INCH,
    expectedCreaseSeams: 2 * 1, // same geometry as t-joint-merged = 2
  }),
  sample({
    id: 't-joint-ascii',
    name: 'T-joint (ASCII)',
    description: 'T-joint saved as an ASCII STL file',
    units: 'mm',
    solids: [tj.merged],
    ascii: true,
    expectedCreaseSeams: 2 * 1, // same geometry as t-joint-merged = 2
  }),
  sample({
    id: 'l-bracket-gussets',
    name: 'L-bracket with gussets',
    description: 'L-bracket with three triangular gussets: many short seams',
    units: 'mm',
    solids: [lBracket()],
    // 4 corner segments (20, 28, 28, 20 mm) + 3 gussets x 4 gusset-to-plate lines (2 faces x 2 legs of 50 mm) = 16
    expectedCreaseSeams: 4 + 3 * 4,
  }),
  sample({
    id: 'box-beam',
    name: 'Box girder',
    description: 'Welded box girder: 4 outside fillets, 4 inside corners only reachable from the open ends',
    units: 'mm',
    solids: [boxGirder()],
    // 4 outside fillet lines (flange overhang meets web outer face, 600 mm each) + 4 inside corner lines (inside the tube, 600 mm each) = 8
    expectedCreaseSeams: 4 + 4,
  }),
  sample({
    id: 'pipe-on-plate',
    name: 'Pipe on plate',
    description: 'Hollow pipe welded to a plate: one outer loop and one bore loop',
    units: 'mm',
    solids: [pipeOnPlate()],
    expectedCreaseSeams: 1 + 1, // outer loop at the pipe-to-plate junction + bore loop where the bore wall meets the plate top = 2
  }),
  sample({
    id: 'double-bottom-cell',
    name: 'Double-bottom cell',
    description: 'Seven separate plates, girders and stiffened floors in exact contact: contact and crease seams',
    units: 'mm',
    solids: doubleBottomCell(),
    expectedCreaseSeams: 3 * 2, // 3 stiffened floors x 2 concave lines (bar top and bar bottom against the floor face) = 6
    // Edges under 10 mm (floor ends at plates and girders, bar tip) are dropped by the length filter.
    expectedContactSeams:
      2 * 2 * 2 + // 2 girders x 2 plates x 2 long edges (800 mm)
      3 * 2 * 2 + // 3 floors x 2 plates x 2 long edges (150 mm)
      3 * 2 * 5, // 3 floors x 2 girders x 5 edges of the T shaped end face (100, 44, 48, 40, 40 mm)
  }),
  sample({
    id: 'bar-through-plate',
    name: 'Bar through plate',
    description: 'Solid round bar passing through a plate: one intersection loop on each face of the plate',
    units: 'mm',
    solids: barThroughPlate(),
    expectedCreaseSeams: 0, // plate and bar are convex solids, so no concave crease exists
    expectedIntersectionSeams: 1 + 1, // loop where the bar leaves the plate top + loop where it leaves the bottom, each 2 pi 25 = 157.08 mm
  }),
  sample({
    id: 'flipped-normals',
    name: 'Flipped normals',
    description: 'Two T-joints with reversed winding, one fully inside out and one mixed: repaired from winding before detection',
    units: 'mm',
    solids: [tj.merged, tj.merged.translate([300, 0, 0])],
    // Left body: every triangle reversed. Right body: only the two web side faces reversed, so its winding is mixed.
    flip: (solid, centroid, normal) => solid === 0 || (Math.abs(normal[1]!) > 0.99 && Math.abs(centroid[1]!) < 10),
    expectedCreaseSeams: 2 * 2, // 2 T-joints x 2 concave lines (web to plate top, 200 mm) = 4, once the winding is repaired
  }),
  sample({
    id: 'tank-with-manhole',
    name: 'Tank with manhole',
    description: 'Closed 8 mm steel tank with floor stiffeners and a 600 mm manhole: inside seams only a snake arm can reach',
    units: 'mm',
    solids: tankWithManhole(),
    expectedCreaseSeams: 4 + 4 + 4, // 4 floor to wall, 4 roof to wall, 4 vertical corners (the shell is one body)
    // 4 stiffeners x 2 long bottom edges on the floor; their 8 mm end edges are under the length filter. The coaming
    // adds its outer loop on the roof; its inner edge fails the overhang test (2 mm land to the hole rim).
    expectedContactSeams: 4 * 2 + 1,
  }),
  sample({
    id: 'tube-frame',
    name: 'Tube frame',
    description: 'Ladder frame of 1 in square tubes with a 1/8 in wall, rungs butting the rails: one weld all around each rung end',
    units: 'mm',
    solids: tubeFrame(),
    expectedCreaseSeams: 0, // every crease is an inside corner of a tube, hidden as hollow = 0
    // 3 rungs x 2 ends, each one closed loop of 4 x 25.4 mm: two fillet sides and two sides flush with the rail = 6
    expectedContactSeams: 3 * 2,
    // 5 tubes x 4 inside corners + 6 rung ends x 1 loop round the bore (4 x 19.04 mm), all inside a tube = 26
    expectedHollowSeams: 5 * 4 + 3 * 2,
  }),
  sample({
    id: 'tube-frame-fused',
    name: 'Tube frame (fused)',
    description: 'The tube frame exported as one solid: one weld all around each rung end, though each end has only two creases',
    units: 'mm',
    solids: tubeFrameFused(),
    // A cavity comes out wound as a void; written outward, the sample loads without a winding repair.
    flip: (solid) => solid > 0,
    // 3 rungs x 2 ends, each one closed loop of 4 x 25.4 mm: two creases and two sides flush with the rail = 6
    expectedCreaseSeams: 3 * 2,
    expectedHollowSeams: 2 * 4, // 2 rails x 4 inside corners; the rails close the rung bores into shells of their own = 8
  }),
]

mkdirSync(OUT_DIR, { recursive: true })
for (const s of samples) {
  const bytes = s.ascii ? asciiStl(s.id, s.soup) : binaryStl(s.id, s.soup)
  writeFileSync(`${OUT_DIR}${s.file}`, bytes)
}

const manifest = sampleManifestSchema.parse({
  version: 1,
  samples: samples.map((s) => ({
    id: s.id,
    file: s.file,
    name: s.name,
    description: s.description,
    units: s.units,
    bodies: s.bodies,
    expectedCreaseSeams: s.expectedCreaseSeams,
    expectedContactSeams: s.expectedContactSeams,
    expectedIntersectionSeams: s.expectedIntersectionSeams,
    expectedHollowSeams: s.expectedHollowSeams,
  })),
})
writeFileSync(`${OUT_DIR}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`wrote ${samples.length} samples and manifest.json to ${OUT_DIR}`)
