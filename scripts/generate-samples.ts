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

function doubleBottomCell(): Manifold[] {
  const bottom = box(0, 800, 0, 500, 0, 12)
  const innerBottom = box(0, 800, 0, 500, 112, 124)
  const girders = [box(0, 800, 165, 175, 12, 112), box(0, 800, 325, 335, 12, 112)]
  const floors = [200, 400, 600].map((x) =>
    M.union(box(x - 4, x + 4, 175, 325, 12, 112), box(x + 3, x + 44, 175, 325, 56, 64)),
  )
  return [bottom, innerBottom, ...girders, ...floors]
}

type Soup = number[]

function toSoup(solids: Manifold[]): Soup {
  const soup: Soup = []
  for (const solid of solids) {
    if (solid.decompose().length !== 1) throw new Error('A sample solid is not a single connected body.')
    const { numProp, vertProperties, triVerts } = solid.getMesh()
    for (const v of triVerts) {
      soup.push(vertProperties[v * numProp]!, vertProperties[v * numProp + 1]!, vertProperties[v * numProp + 2]!)
    }
  }
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

type Counted = 'expectedContactSeams' | 'expectedIntersectionSeams'

function sample(
  fields: Omit<SampleEntry, 'file' | 'bodies' | Counted> &
    Partial<Pick<SampleEntry, Counted>> & { solids: Manifold[]; scale?: number; ascii?: boolean },
): Sample {
  const { solids, scale = 1, ascii = false, expectedContactSeams = 0, expectedIntersectionSeams = 0, ...entry } = fields
  return {
    ...entry,
    expectedContactSeams,
    expectedIntersectionSeams,
    file: `${entry.id}.stl`,
    bodies: solids.length,
    soup: toSoup(solids).map((x) => x * scale),
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
  })),
})
writeFileSync(`${OUT_DIR}manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`wrote ${samples.length} samples and manifest.json to ${OUT_DIR}`)
