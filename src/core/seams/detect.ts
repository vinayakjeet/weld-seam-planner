import { computeFaceData, type FaceData } from '../mesh/faces'
import type { MeshModel } from '../mesh/model'
import { chainEdges, edgeEnds, type Chain } from './chain'
import { confidence } from './confidence'
import { extractCreaseEdges, type CreaseEdges } from './crease'
import { buildSeamPoints, type SeamPoint } from './frames'

export interface DetectSettings {
  creaseAngleDeg: number
}

export const DEFAULT_DETECT_SETTINGS: DetectSettings = { creaseAngleDeg: 30 }

export interface SeamCandidate {
  id: string
  label: string
  source: 'crease'
  jointType: 'fillet'
  confidence: number
  closed: boolean
  lengthMm: number
  openingAngleDeg: number
  points: SeamPoint[]
}

const TURN_BREAK_DEG = 40
const MIN_LENGTH_MM = 10
const MIN_LENGTH_FRACTION = 0.01

export function detectSeams(model: MeshModel, settings: DetectSettings): SeamCandidate[] {
  const faces = computeFaceData(model.mesh)
  const creases = extractCreaseEdges(model, faces, settings.creaseAngleDeg)
  const chains = chainEdges(model.mesh.positions, edgeEnds(model.edges, creases.edgeIds), TURN_BREAK_DEG)
  const minLength = Math.max(MIN_LENGTH_MM, MIN_LENGTH_FRACTION * model.bounds.diagonal)

  const found: Omit<SeamCandidate, 'label'>[] = []
  for (const chain of chains) {
    const { points, lengthMm } = buildSeamPoints(chain, creases.edgeIds, model, faces)
    if (lengthMm < minLength) continue
    const { openingAngleDeg, medianAdjacentAreaMm2 } = describeChain(chain, creases, model, faces)
    found.push({
      id: '',
      source: 'crease',
      jointType: 'fillet',
      confidence: confidence({ lengthMm, openingDeg: openingAngleDeg, medianAdjacentAreaMm2, diagonal: model.bounds.diagonal }),
      closed: chain.closed,
      lengthMm,
      openingAngleDeg,
      points,
    })
  }

  for (const seam of found) seam.id = seamId(seam)
  found.sort((a, b) => Math.round(b.lengthMm * 1000) - Math.round(a.lengthMm * 1000) || a.id.localeCompare(b.id))

  const used = new Set<string>()
  return found.map((seam, i) => {
    let id = seam.id
    for (let n = 2; used.has(id); n++) id = `${seam.id}-${n}`
    used.add(id)
    return { ...seam, id, label: `S${i + 1}` }
  })
}

// Opening angle is the length-weighted mean of 180 - theta; the area is the median over the faces beside the seam.
function describeChain(chain: Chain, creases: CreaseEdges, model: MeshModel, faces: FaceData) {
  const { positions } = model.mesh
  let weighted = 0
  let total = 0
  const areas: number[] = []
  for (const index of chain.edges) {
    const edge = creases.edgeIds[index]!
    const a = model.edges.edgeA[edge]! * 3
    const b = model.edges.edgeB[edge]! * 3
    const length = Math.hypot(positions[a]! - positions[b]!, positions[a + 1]! - positions[b + 1]!, positions[a + 2]! - positions[b + 2]!)
    weighted += length * (180 - creases.dihedralDeg[index]!)
    total += length
    areas.push(faces.areas[model.edges.faceA[edge]!]!, faces.areas[model.edges.faceB[edge]!]!)
  }
  areas.sort((x, y) => x - y)
  const mid = areas.length >> 1
  const median = areas.length % 2 === 1 ? areas[mid]! : (areas[mid - 1]! + areas[mid]!) / 2
  return { openingAngleDeg: weighted / total, medianAdjacentAreaMm2: median }
}

// Stable across runs and across settings that leave the seam unchanged: hashes the start, middle and end points
// and the length, each rounded to 0.1 mm.
function seamId(seam: Omit<SeamCandidate, 'label'>): string {
  const { points } = seam
  const pick = [points[0]!, points[points.length >> 1]!, points[points.length - 1]!]
  const key = [...pick.flatMap(({ p }) => p), seam.lengthMm].map((x) => Math.round(x * 10)).join(',')
  let hash = 0x811c9dc5
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `crease-${(hash >>> 0).toString(16).padStart(8, '0')}`
}
