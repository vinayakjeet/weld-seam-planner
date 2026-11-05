import type { Vec3 } from '../math/vec3'
import { effectiveLegMm, legLimits, trustedThickness, type LegSource, type PlateThickness } from '../process/filletRules'
import { DEFAULT_WELD_TOLERANCE } from '../mesh/weld'
import { heatInputCheck, heatInputKJmm, type Check } from '../process/heatInput'
import { depositionTravelMmMin, travelSpeedCheck } from '../process/travelSpeed'
import { resolveProcedure } from '../process/wps'
import { DEFAULT_DETECT_SETTINGS, type SeamCandidate } from '../seams/detect'
import type { SequenceStrategy } from '../sequence/types'
import type { ArmParams, Port } from '../snake/arm'
import { DEFAULT_TORCH, type TorchParams } from '../torch/frames'
import type { Procedure, ProcedureOverrides, SeamAccess } from './schema'

export interface Explained {
  what: string
  why: string
  next: string
}

export interface JobSettings {
  poseSpacingMm: number
  airSpeedMmS: number
  approachMm: number
  creaseAngleDeg: number
  // Torch cleaning: one stop of cleanTimeS after every cleanEveryS of arc time. 0 means the torch is not cleaned.
  cleanEveryS: number
  cleanTimeS: number
  // Vertex weld cell as a fraction of the part's bounding box diagonal; detection ran on the part welded at it.
  weldToleranceRel: number
}

export const DEFAULT_JOB_SETTINGS: JobSettings = {
  poseSpacingMm: 5,
  airSpeedMmS: 250,
  approachMm: 50,
  creaseAngleDeg: DEFAULT_DETECT_SETTINGS.creaseAngleDeg,
  cleanEveryS: 0,
  cleanTimeS: 30,
  weldToleranceRel: DEFAULT_WELD_TOLERANCE,
}

// What the worker reports about the loaded part, plus its hash. core cannot import the worker's PartInfo.
export interface JobPart {
  name: string
  sha256: string
  sourceUnits: 'mm' | 'in' | 'm' | 'unknown'
  scaleToMm: number
  triangles: number
  bodies: number
  bbox: { min: Vec3; max: Vec3 }
}

export interface PlannedSeam {
  seam: SeamCandidate
  procedureId: string | null
  overrides: ProcedureOverrides
  // null until the user sets a leg; then the default leg of the procedure applies.
  legMm: number | null
  access: SeamAccess | null
}

// The order the seams are welded in and which end each one starts from. A reversed flag on a closed loop is ignored.
export interface PlanSequence {
  strategy: SequenceStrategy
  order: { seamId: string; reversed: boolean }[]
}

// Accepted seams in table order. A null sequence means table order, every seam forward.
export interface Plan {
  part: JobPart
  gravity: Vec3
  settings: JobSettings
  procedures: Procedure[]
  seams: PlannedSeam[]
  sequence: PlanSequence | null
  // Access ports and the snake arm used for reach analysis; the arm is exported only when a port exists.
  access: { ports: Port[]; arm: ArmParams }
}

// A drag technique leans the torch back along travel, which is a negative travel angle.
export function torchParamsFor(procedure: Procedure, settings: JobSettings): TorchParams {
  const { workAngleOffsetDeg, travelAngleDeg, technique } = procedure.torch
  return {
    workAngleDeg: workAngleOffsetDeg,
    travelAngleDeg: technique === 'drag' ? -travelAngleDeg : travelAngleDeg,
    cornerBlendMm: DEFAULT_TORCH.cornerBlendMm,
    approachMm: settings.approachMm,
  }
}

export interface ResolvedSeam {
  // The library procedure with the seam's overrides applied; null when none is assigned or the id is not in the library.
  procedure: Procedure | null
  thickness: PlateThickness
  leg: { legMm: number; source: LegSource }
  limits: { minMm: number | null; maxMm: number | null }
  heatInputKJmm: number | null
  // From the wire deposition at the effective leg; null without a wire feed.
  suggestedTravelMmS: number | null
  heatCheck: Check
  travelCheck: Check
}

const OK: Check = { level: 'ok', reason: '' }

export function resolveSeam(plan: Plan, planned: PlannedSeam): ResolvedSeam {
  const base = planned.procedureId === null ? undefined : plan.procedures.find((p) => p.id === planned.procedureId)
  const procedure = base ? resolveProcedure(base, planned.overrides) : null
  const { jointType } = planned.seam
  const thickness = trustedThickness(jointType, planned.seam.thicknessMm)
  const leg = effectiveLegMm({ legMm: planned.legMm, procedure, thickness, jointType })
  const limits = legLimits(jointType, thickness)
  if (!procedure) {
    return { procedure, thickness, leg, limits, heatInputKJmm: null, suggestedTravelMmS: null, heatCheck: OK, travelCheck: OK }
  }

  const { electrical, wire, thermalEfficiency, travelSpeedMmS } = procedure
  const q = heatInputKJmm(thermalEfficiency, electrical.voltageV, electrical.currentA, travelSpeedMmS * 60)
  const known = thickness.filter((t): t is number => t !== null)
  const suggestedMmMin =
    electrical.wireFeedMpm === undefined
      ? null
      : depositionTravelMmMin({ wireDiameterMm: wire.diameterMm, wireFeedMpm: electrical.wireFeedMpm, legMm: leg.legMm })
  const suggestedTravelMmS = suggestedMmMin === null ? null : suggestedMmMin / 60
  return {
    procedure,
    thickness,
    leg,
    limits,
    heatInputKJmm: q,
    suggestedTravelMmS,
    heatCheck: heatInputCheck(q, known.length > 0 ? Math.max(...known) : null),
    travelCheck: travelSpeedCheck(travelSpeedMmS, suggestedTravelMmS),
  }
}
