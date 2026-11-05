import { reconcileOrder } from '../sequence/order'
import { DEFAULT_ARM } from '../snake/arm'
import { DEFAULT_JOB_SETTINGS, resolveSeam, type Explained, type Plan, type PlannedSeam } from './plan'
import { jobSchema } from './schema'

type Outcome = { status: 'ok'; plan: Plan } | { status: 'error'; error: Explained }

const refuse = (what: string, why: string, next: string): Outcome => ({ status: 'error', error: { what, why, next } })

const MAX_LISTED_PATHS = 3
const LEG_MATCH_MM = 0.005

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function importJob(input: string | unknown, expectedSha256: string): Outcome {
  let data: unknown = input
  if (typeof input === 'string') {
    try {
      data = JSON.parse(input)
    } catch (error) {
      return refuse(
        'This file is not JSON.',
        `It could not be read as JSON: ${error instanceof Error ? error.message : 'unknown error'}.`,
        'Choose a plan file that this app exported, which ends in .json.',
      )
    }
  }

  if (!isRecord(data) || data.format !== 'weld-job') {
    return refuse(
      'This file is not a weld job plan.',
      `Its format field is ${isRecord(data) && data.format !== undefined ? JSON.stringify(data.format) : 'missing'}, and plans have the format "weld-job".`,
      'Choose a plan file that this app exported, which ends in .json.',
    )
  }

  const version = typeof data.version === 'string' ? data.version : null
  if (version !== null && !version.startsWith('1.')) {
    return refuse(
      `This plan is version ${version}, which this app cannot read.`,
      'This app reads version 1 plans, and a new major version can change the meaning of a field.',
      'Export the plan again from the app that wrote it, or open it in a newer version of this app.',
    )
  }

  const parsed = jobSchema.safeParse(data)
  if (!parsed.success) {
    const issues = parsed.error.issues
    const listed = issues.slice(0, MAX_LISTED_PATHS).map((i) => `${i.path.join('.') || 'the file'} (${i.message})`)
    const more = issues.length > MAX_LISTED_PATHS ? `, and ${issues.length - MAX_LISTED_PATHS} more` : ''
    return refuse(
      'This plan file is not a valid weld job.',
      `These fields are wrong: ${listed.join('; ')}${more}.`,
      'Export the plan again from this app, or undo the manual edits to the file.',
    )
  }
  const job = parsed.data

  if (job.part.sha256 !== expectedSha256) {
    return refuse(
      'This plan belongs to a different part.',
      `The plan was made for a part with hash ${job.part.sha256.slice(0, 8)}, and the loaded part has hash ${expectedSha256.slice(0, 8)}.`,
      'Open the STL it was made for, then import the plan again.',
    )
  }

  for (const seam of job.seams) {
    if (!seam.points || seam.points.length === 0) {
      return refuse(
        `Seam ${seam.label} cannot be restored.`,
        'The file has no points for it, and without them a curved or edited seam cannot be rebuilt exactly.',
        'Export the plan again from this app, which writes the points of every seam.',
      )
    }
    if (seam.jointType === 'butt') {
      return refuse(
        `Seam ${seam.label} is a butt joint.`,
        'This app plans fillet, lap, corner and saddle joints, so it cannot restore a butt joint.',
        'Remove the seam from the file, or plan it in the app that wrote it.',
      )
    }
  }

  const plan: Plan = {
    part: {
      name: job.part.name,
      sha256: job.part.sha256,
      sourceUnits: job.part.sourceUnits,
      scaleToMm: job.part.scaleToMm,
      triangles: job.part.triangles,
      bodies: job.part.bodies,
      bbox: { min: job.part.boundingBox.min, max: job.part.boundingBox.max },
    },
    gravity: job.frames.gravity,
    settings: { ...job.settings, cleanEveryS: job.settings.cleanEveryS ?? DEFAULT_JOB_SETTINGS.cleanEveryS, cleanTimeS: job.settings.cleanTimeS ?? DEFAULT_JOB_SETTINGS.cleanTimeS },
    procedures: job.procedures,
    seams: job.seams.map(
      (seam): PlannedSeam => ({
        seam: {
          id: seam.id,
          label: seam.label,
          source: seam.source,
          concavity: 'known',
          jointType: seam.jointType as 'fillet',
          hidden: false,
          confidence: seam.confidence,
          closed: seam.closed,
          lengthMm: seam.lengthMm,
          openingAngleDeg: seam.geometry.openingAngleDeg,
          points: seam.points!,
          thicknessMm: seam.geometry.plateThicknessMm ?? [null, null],
        },
        procedureId: seam.procedureId,
        overrides: seam.overrides,
        legMm: seam.legMm,
        access: seam.access,
      }),
    ),
    access: {
      ports: job.access.ports.map((port) => ({ id: port.id, position: port.position, direction: port.direction, diameterMm: port.diameterMm })),
      arm: job.access.arm
        ? {
            links: job.access.arm.links,
            linkLengthMm: job.access.arm.linkLengthMm,
            diameterMm: job.access.arm.diameterMm,
            maxBendDeg: job.access.arm.maxBendDeg,
            torchLengthMm: job.access.arm.torchLengthMm,
            insertionMm: job.access.arm.insertionMm,
            clearanceMm: job.access.arm.clearanceMm,
          }
        : DEFAULT_ARM,
    },
    sequence: {
      strategy: job.sequence.strategy,
      order: reconcileOrder(
        job.sequence.order.map((entry) => ({ seamId: entry.seamId, reversed: entry.reversed })),
        job.seams.map((seam) => seam.id),
      ),
    },
  }

  // A leg equal to the default stays a default, so changing the procedure later still moves it.
  plan.seams = plan.seams.map((planned) => {
    const fallback = resolveSeam(plan, { ...planned, legMm: null }).leg.legMm
    return planned.legMm !== null && Math.abs(Math.round(fallback * 100) / 100 - planned.legMm) < LEG_MATCH_MM ? { ...planned, legMm: null } : planned
  })

  return { status: 'ok', plan }
}
