import { createHash } from 'node:crypto'
import { pointsFromPolyline } from '../../../src/core/seams/frames'
import { DEFAULT_DETECT_SETTINGS, detectSeams, type SeamCandidate } from '../../../src/core/seams/detect'
import { DEFAULT_JOB_SETTINGS, type Plan, type PlannedSeam } from '../../../src/core/job/plan'
import { WPS_PRESETS } from '../../../src/core/process/wps'
import type { Vec3 } from '../../../src/core/math/vec3'
import { scaleToMm } from '../../../src/core/mesh/units'
import { loadSampleModel } from './models'
import { readManifest, readSample } from './samples'
import { seam } from './state'

export const SPRAY_ID = 'WPS-GMAW-SPRAY-FW6'

export function samplePlan(id: string, edit?: (plan: Plan) => Plan): Plan {
  const entry = readManifest().samples.find((s) => s.id === id)
  if (!entry) throw new Error(`Unknown sample ${id}`)
  const model = loadSampleModel(id)
  const sha256 = createHash('sha256').update(new Uint8Array(readSample(id))).digest('hex')
  const seams: PlannedSeam[] = detectSeams(model, DEFAULT_DETECT_SETTINGS)
    .filter((s) => !s.hidden)
    .map((s) => ({ seam: s, procedureId: SPRAY_ID, overrides: {}, legMm: null, access: null }))
  const plan: Plan = {
    part: {
      name: entry.file,
      sha256,
      sourceUnits: entry.units,
      scaleToMm: scaleToMm(entry.units),
      triangles: model.mesh.triangleCount,
      bodies: model.bodies.count,
      bbox: { min: model.bounds.min, max: model.bounds.max },
    },
    gravity: [0, 0, -1],
    settings: { ...DEFAULT_JOB_SETTINGS },
    procedures: structuredClone([...WPS_PRESETS]),
    seams,
  }
  return edit ? edit(plan) : plan
}

export interface StraightSeam {
  id: string
  from: Vec3
  to: Vec3
  normals?: [Vec3, Vec3]
  thicknessMm?: SeamCandidate['thicknessMm']
}

// A straight fillet whose plates are the one with normal +z and the one with normal -y, as in the spec example.
export function straightSeam({ id, from, to, normals = [[0, 0, 1], [0, -1, 0]], thicknessMm = [12, 12] }: StraightSeam): SeamCandidate {
  const { points, lengthMm } = pointsFromPolyline([from, to], false, () => normals)
  return seam(id, 0.96, lengthMm, { points, thicknessMm, label: id.toUpperCase(), source: 'contact', openingAngleDeg: 90 })
}

// The example of the spec: one 800 mm seam, spray procedure, Z up.
export function specExamplePlan(seams: StraightSeam[] = [{ id: 's07', from: [1200, 300, 12], to: [2000, 300, 12] }]): Plan {
  return {
    part: {
      name: 'double-bottom-cell.stl',
      sha256: 'a'.repeat(64),
      sourceUnits: 'mm',
      scaleToMm: 1,
      triangles: 18432,
      bodies: 7,
      bbox: { min: [0, 0, 0], max: [2400, 1600, 900] },
    },
    gravity: [0, 0, -1],
    settings: { ...DEFAULT_JOB_SETTINGS },
    procedures: structuredClone([...WPS_PRESETS]),
    seams: seams.map((s) => ({ seam: straightSeam(s), procedureId: SPRAY_ID, overrides: {}, legMm: null, access: null })),
  }
}

export const CREATED_AT = '2026-11-04T10:15:00Z'
