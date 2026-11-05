import { z } from 'zod'
import { SEQUENCE_STRATEGIES } from '../core/sequence/types'
import { procedureOverridesSchema, procedureSchema, vec3Schema } from '../core/job/schema'
import { DEFAULT_JOB_SETTINGS } from '../core/job/plan'
import { DEFAULT_WELD_TOLERANCE, WELD_TOLERANCE_RANGE } from '../core/mesh/weld'
import { DEFAULT_ARM } from '../core/snake/arm'
import type { SeamCandidate } from '../core/seams/detect'
import type { ManualError } from '../core/seams/manual'
import { legacySeamId } from '../core/seams/seamId'
import type { AppState } from './store'

// Version 2 keys seams by the ids of core/seams/seamId.ts. Version 1 plans are still read and their ids are moved over
// by migrateSavedIds once the part has been detected again.
export const SAVED_PLAN_VERSION = 2
const READABLE_VERSIONS = [1, SAVED_PLAN_VERSION] as const

export const savedKey = (sha256: string) => `weld-plan:${sha256}`

const JOINT_TYPES = ['fillet', 'lap', 'corner', 'saddle'] as const
const SEAM_SOURCES = ['crease', 'contact', 'intersection', 'nonmanifold', 'manual'] as const
const thickness = z.number().positive().nullable()
const pointSchema = z.object({ s: z.number().min(0), p: vec3Schema, t: vec3Schema, n1: vec3Schema, n2: vec3Schema })

const seamSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  source: z.enum(SEAM_SOURCES),
  concavity: z.enum(['known', 'unknown']),
  jointType: z.enum(JOINT_TYPES),
  hidden: z.boolean(),
  confidence: z.number(),
  closed: z.boolean(),
  lengthMm: z.number().min(0),
  openingAngleDeg: z.number(),
  points: z.array(pointSchema),
  thicknessMm: z.tuple([thickness, thickness]),
  approximateNormals: z.boolean().optional(),
  slot: z.string().optional(),
})

const portSchema = z.object({ id: z.string().min(1), position: vec3Schema, direction: vec3Schema, diameterMm: z.number().positive() })

const armSchema = z.object({
  links: z.number(),
  linkLengthMm: z.number(),
  diameterMm: z.number(),
  maxBendDeg: z.number(),
  torchLengthMm: z.number(),
  insertionMm: z.number(),
  clearanceMm: z.number(),
})

export const savedPlanSchema = z.object({
  version: z.union([z.literal(1), z.literal(SAVED_PLAN_VERSION)]),
  savedAt: z.iso.datetime(),
  partName: z.string(),
  sha256: z.string().min(1),
  statusById: z.record(z.string(), z.enum(['accepted', 'rejected'])),
  typeById: z.record(z.string(), z.enum(JOINT_TYPES)),
  manualSeams: z.array(seamSchema),
  supersededIds: z.array(z.string()),
  nextDrawnId: z.number().int().min(1),
  // Absent in plans saved before ports were counted; the highest port id then decides.
  nextPortNumber: z.number().int().min(1).optional(),
  procedures: z.array(procedureSchema),
  procedureById: z.record(z.string(), z.string()),
  overridesById: z.record(z.string(), procedureOverridesSchema),
  legById: z.record(z.string(), z.number().positive()),
  thicknessById: z.record(z.string(), z.tuple([thickness, thickness])),
  // Entries written before the sequence was stored have neither field and read as table order.
  strategy: z.enum(SEQUENCE_STRATEGIES).default('table-order'),
  order: z.array(z.object({ seamId: z.string().min(1), reversed: z.boolean(), locked: z.boolean() })).default([]),
  // Entries written before ports existed have neither field and read as no ports and the default arm.
  ports: z.array(portSchema).default([]),
  arm: armSchema.default(DEFAULT_ARM),
  gravity: vec3Schema,
  detectSettings: z.object({ creaseAngleDeg: z.number() }),
  // Entries written before the weld tolerance could be changed read as the default.
  weldTolerance: z.number().min(WELD_TOLERANCE_RANGE.min).max(WELD_TOLERANCE_RANGE.max).default(DEFAULT_WELD_TOLERANCE),
  // Entries written before torch cleaning was modelled have neither cleaning field and read as no cleaning.
  jobSettings: z.object({
    poseSpacingMm: z.number().positive(),
    airSpeedMmS: z.number().positive(),
    approachMm: z.number().min(0),
    cleanEveryS: z.number().min(0).default(DEFAULT_JOB_SETTINGS.cleanEveryS),
    cleanTimeS: z.number().min(0).default(DEFAULT_JOB_SETTINGS.cleanTimeS),
  }),
})

export type SavedPlan = z.output<typeof savedPlanSchema>

export type ParsedSaved = { status: 'ok'; saved: SavedPlan } | { status: 'error'; error: ManualError }

// The plan fields of the store, as they are written to storage.
export function snapshotOf(state: AppState, savedAt: string): SavedPlan {
  if (state.part === null) throw new Error('There is no part, so there is no plan to save.')
  return {
    version: SAVED_PLAN_VERSION,
    savedAt,
    partName: state.part.name,
    sha256: state.part.sha256,
    statusById: state.statusById,
    typeById: state.typeById,
    manualSeams: state.manualSeams,
    supersededIds: state.supersededIds,
    nextDrawnId: state.nextDrawnId,
    nextPortNumber: state.nextPortNumber,
    procedures: state.procedures,
    procedureById: state.procedureById,
    overridesById: state.overridesById,
    legById: state.legById,
    thicknessById: state.thicknessById,
    strategy: state.strategy,
    order: state.order,
    ports: state.ports,
    arm: state.arm,
    gravity: state.gravity,
    detectSettings: state.detectSettings,
    weldTolerance: state.weldTolerance,
    jobSettings: state.jobSettings,
  }
}

const NEXT = 'Choose Start fresh. The next change you make saves a new plan over it.'

export function parseSaved(value: unknown): ParsedSaved {
  const version = typeof value === 'object' && value !== null && 'version' in value ? (value as { version: unknown }).version : undefined
  if (typeof version === 'number' && !READABLE_VERSIONS.some((v) => v === version)) {
    return {
      status: 'error',
      error: {
        what: `The saved plan for this part is version ${version}, which this app cannot read.`,
        why: `This app reads versions ${READABLE_VERSIONS.join(' and ')}; a plan saved by a different version of the app can mean something else.`,
        next: NEXT,
      },
    }
  }
  const parsed = savedPlanSchema.safeParse(value)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!
    const where = issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''
    return {
      status: 'error',
      error: {
        what: 'The saved plan for this part is damaged, so it was not offered.',
        why: `The stored data does not match the expected format (${where}${issue.message}).`,
        next: NEXT,
      },
    }
  }
  return { status: 'ok', saved: parsed.data }
}

export function offerSummary(saved: SavedPlan): { acceptedSeams: number; proceduresInUse: number } {
  const accepted = Object.entries(saved.statusById).filter(([, status]) => status === 'accepted').map(([id]) => id)
  return { acceptedSeams: accepted.length, proceduresInUse: new Set(accepted.map((id) => saved.procedureById[id]).filter(Boolean)).size }
}

// A version 1 plan names seams by ids made from their start, middle and end points. Each seam detected now gets the id
// version 1 would have given it (same geometry to 0.1 mm), and every id in the plan moves to the new id of that seam.
// An id no seam matches, a drawn seam's or one whose geometry has changed since, is left as it is.
export function migrateSavedIds(saved: SavedPlan, detected: SeamCandidate[]): SavedPlan {
  if (saved.version === SAVED_PLAN_VERSION) return saved
  const moved = new Map<string, string>()
  const seen = new Map<string, number>()
  for (const seam of detected) {
    const base = legacySeamId(seam)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    moved.set(n === 1 ? base : `${base}-${n}`, seam.id)
  }
  const id = (old: string) => moved.get(old) ?? old
  const keyed = <T>(record: Record<string, T>): Record<string, T> => Object.fromEntries(Object.entries(record).map(([key, value]) => [id(key), value]))
  return {
    ...saved,
    version: SAVED_PLAN_VERSION,
    statusById: keyed(saved.statusById),
    typeById: keyed(saved.typeById),
    manualSeams: saved.manualSeams.map((seam) => (seam.slot === undefined ? seam : { ...seam, slot: id(seam.slot) })),
    supersededIds: saved.supersededIds.map(id),
    procedureById: keyed(saved.procedureById),
    overridesById: keyed(saved.overridesById),
    legById: keyed(saved.legById),
    thicknessById: keyed(saved.thicknessById),
    order: saved.order.map((entry) => ({ ...entry, seamId: id(entry.seamId) })),
  }
}
