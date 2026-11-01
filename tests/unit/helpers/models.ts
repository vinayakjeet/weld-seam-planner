import { buildMeshModel, type MeshModel } from '../../../src/core/mesh/model'
import { parseStl } from '../../../src/core/mesh/parseStl'
import { scaleToMm, type KnownUnits } from '../../../src/core/mesh/units'
import { readManifest, readSample } from './samples'

export function loadSoup(id: string): Float32Array {
  return parseStl(readSample(id)).positions
}

export function loadSampleModel(id: string, units?: KnownUnits): MeshModel {
  const entry = readManifest().samples.find((s) => s.id === id)
  if (!entry) throw new Error(`Unknown sample ${id}`)
  return buildMeshModel(loadSoup(id), scaleToMm(units ?? entry.units))
}

interface Transform {
  scale?: number
  rotate?: { axis: [number, number, number]; angleDeg: number }
  translate?: [number, number, number]
}

// Scale about the origin, rotate about the soup's bounding box centre, then translate; all in double precision.
export function transformSoup(soup: Float32Array, { scale = 1, rotate, translate }: Transform): Float32Array {
  const out = new Float32Array(soup.length)
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < soup.length; i++) {
    lo[i % 3] = Math.min(lo[i % 3]!, soup[i]! * scale)
    hi[i % 3] = Math.max(hi[i % 3]!, soup[i]! * scale)
  }
  const centre = lo.map((v, c) => (v + hi[c]!) / 2)
  const [ax, ay, az] = rotate ? rotate.axis : [0, 0, 1]
  const axisLength = Math.hypot(ax, ay, az)
  const k = [ax / axisLength, ay / axisLength, az / axisLength]
  const angle = ((rotate?.angleDeg ?? 0) * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  for (let i = 0; i < soup.length; i += 3) {
    const p = [0, 1, 2].map((c) => soup[i + c]! * scale - centre[c]!)
    const dot = k[0]! * p[0]! + k[1]! * p[1]! + k[2]! * p[2]!
    const cross = [
      k[1]! * p[2]! - k[2]! * p[1]!,
      k[2]! * p[0]! - k[0]! * p[2]!,
      k[0]! * p[1]! - k[1]! * p[0]!,
    ]
    for (let c = 0; c < 3; c++) {
      const rotated = p[c]! * cos + cross[c]! * sin + k[c]! * dot * (1 - cos)
      out[i + c] = rotated + centre[c]! + (translate?.[c] ?? 0)
    }
  }
  return out
}
