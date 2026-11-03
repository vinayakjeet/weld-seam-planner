import type { Vec3 } from '../math/vec3'
import { effectiveLegMm, legLimits, type LegSource, type PlateThickness } from '../process/filletRules'
import { heatInputCheck, heatInputKJmm, type Check } from '../process/heatInput'
import { depositionTravelMmMin, travelSpeedCheck } from '../process/travelSpeed'
import { resolveProcedure } from '../process/wps'
import { DEFAULT_DETECT_SETTINGS, type SeamCandidate } from '../seams/detect'
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
}

export const DEFAULT_JOB_SETTINGS: JobSettings = {
  poseSpacingMm: 5,
  airSpeedMmS: 250,
  approachMm: 50,
  creaseAngleDeg: DEFAULT_DETECT_SETTINGS.creaseAngleDeg,
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

// Accepted seams in table order.
export interface Plan {
  part: JobPart
  gravity: Vec3
  settings: JobSettings
  procedures: Procedure[]
  seams: PlannedSeam[]
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
  const { jointType, thicknessMm: thickness } = planned.seam
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
