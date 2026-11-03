import { z } from 'zod'
import { PROCESSES } from '../process/heatInput'

export const ISO_POSITIONS = ['PA', 'PB', 'PC', 'PD', 'PE', 'PF', 'PG'] as const

const baseMaterialSchema = z.looseObject({
  spec: z.string().min(1),
  thicknessMm: z
    .tuple([z.number().positive(), z.number().positive()])
    .refine(([lo, hi]) => lo <= hi, { message: 'The thickness range must run from the smaller to the larger value.' }),
})

const wireSchema = z.looseObject({
  classification: z.string().min(1),
  diameterMm: z.number().positive(),
})

const gasSchema = z.looseObject({
  mix: z.string().min(1),
  flowLpm: z.number().positive(),
})

const electricalSchema = z.looseObject({
  currentA: z.number().positive(),
  voltageV: z.number().positive(),
  wireFeedMpm: z.number().positive().optional(),
  polarity: z.enum(['DCEP', 'DCEN', 'AC']),
})

const torchSchema = z.looseObject({
  workAngleOffsetDeg: z.number(),
  travelAngleDeg: z.number().min(0),
  technique: z.enum(['push', 'drag']),
})

const weaveSchema = z.looseObject({
  pattern: z.enum(['none', 'zigzag', 'triangle', 'circle']),
  amplitudeMm: z.number().min(0),
  frequencyHz: z.number().min(0),
  dwellMs: z.number().min(0),
})

const arcStartSchema = z.looseObject({ preflowS: z.number().min(0) })

const arcEndSchema = z.looseObject({
  craterFillS: z.number().min(0),
  burnbackMs: z.number().min(0),
  postflowS: z.number().min(0),
})

export const procedureSchema = z.looseObject({
  id: z.string().min(1).meta({ description: 'Stable id referenced by seams.' }),
  name: z.string().min(1).meta({ description: 'Readable name.' }),
  process: z.enum(PROCESSES).meta({ description: 'GMAW, FCAW, GTAW or SAW.' }),
  transfer: z.enum(['short-circuit', 'spray', 'pulse']).optional().meta({ description: 'Metal transfer mode.' }),
  baseMaterial: baseMaterialSchema.meta({ description: 'Material spec and the thickness range in mm this procedure covers.' }),
  wire: wireSchema.meta({ description: 'Filler classification and diameter in mm.' }),
  gas: gasSchema.optional().meta({ description: 'Shielding gas mix and flow in L/min.' }),
  electrical: electricalSchema.meta({ description: 'Current in A, voltage in V, wire feed speed in m/min, polarity.' }),
  travelSpeedMmS: z.number().positive().meta({ description: 'Travel speed in mm/s.' }),
  ctwdMm: z.number().positive().nullable().meta({ description: 'Contact tip to work distance in mm, null when not applicable.' }),
  torch: torchSchema.meta({ description: 'Work angle offset from the bisector in degrees, travel angle, push or drag.' }),
  weave: weaveSchema.meta({ description: 'Pattern, amplitude in mm, frequency in Hz, dwell at the edges in ms.' }),
  arcStart: arcStartSchema.meta({ description: 'Pre-flow in seconds.' }),
  arcEnd: arcEndSchema.meta({ description: 'Crater fill in seconds, burnback in ms, post-flow in seconds.' }),
  positions: z.array(z.enum(ISO_POSITIONS)).min(1).meta({ description: 'ISO 6947 positions this procedure is valid for.' }),
  thermalEfficiency: z.number().gt(0).max(1).meta({ description: 'Process factor k used for heat input.' }),
  preheatC: z.number().meta({ description: 'Preheat temperature in degrees C.' }),
  interpassMaxC: z.number().meta({ description: 'Maximum interpass temperature in degrees C.' }),
})

export type Procedure = z.output<typeof procedureSchema>

// Every procedure field except id and name, with nested objects partial, so a seam can change one number.
export const procedureOverridesSchema = z.looseObject({
  process: procedureSchema.shape.process.optional(),
  transfer: procedureSchema.shape.transfer,
  baseMaterial: baseMaterialSchema.partial().optional(),
  wire: wireSchema.partial().optional(),
  gas: gasSchema.partial().optional(),
  electrical: electricalSchema.partial().optional(),
  travelSpeedMmS: z.number().positive().optional(),
  ctwdMm: z.number().positive().nullable().optional(),
  torch: torchSchema.partial().optional(),
  weave: weaveSchema.partial().optional(),
  arcStart: arcStartSchema.partial().optional(),
  arcEnd: arcEndSchema.partial().optional(),
  positions: procedureSchema.shape.positions.optional(),
  thermalEfficiency: z.number().gt(0).max(1).optional(),
  preheatC: z.number().optional(),
  interpassMaxC: z.number().optional(),
})

export type ProcedureOverrides = z.output<typeof procedureOverridesSchema>

export const SCHEMA_URL = 'https://weld-seam-planner.vercel.app/schema/weld-job-1.0.json'

export const JOB_UNITS = {
  length: 'mm',
  angle: 'deg',
  time: 's',
  speed: 'mm/s',
  wireFeed: 'm/min',
  gasFlow: 'L/min',
  heatInput: 'kJ/mm',
  mass: 'kg',
} as const

export const FRAME_CONVENTION =
  'right-handed; positions in the part frame; quaternion order x,y,z,w; tool z points from torch into joint; tool x along travel'

const num = z.number()
const nonNegative = z.number().min(0)
const positiveNum = z.number().positive()

export const vec3Schema = z.tuple([num, num, num])

const UNIT_LENGTH_TOLERANCE = 1e-4

export const quatSchema = z
  .tuple([z.number().min(-1).max(1), z.number().min(-1).max(1), z.number().min(-1).max(1), z.number().min(0).max(1)])
  .refine(([x, y, z, w]) => Math.abs(Math.hypot(x, y, z, w) - 1) <= UNIT_LENGTH_TOLERANCE, {
    message: 'A quaternion must have unit length.',
  })

export const issueSchema = z.looseObject({
  code: z.string().min(1),
  seamId: z.string().nullable(),
  message: z.string().min(1),
})

export type JobIssue = z.output<typeof issueSchema>

export const seamPointSchema = z.looseObject({ s: nonNegative, p: vec3Schema, t: vec3Schema, n1: vec3Schema, n2: vec3Schema })

export const seamAccessSchema = z.looseObject({
  clearanceDeg: num.nullable(),
  // Free cone half-angle out to 60 mm; null in files written before the field existed.
  nearClearanceDeg: num.nullable().default(null),
  class: z.enum(['standard', 'slim', 'snake', 'blocked']).nullable(),
  portId: z.string().nullable(),
  reachCoverage: z.number().min(0).max(1).nullable(),
  unreachable: z.array(z.tuple([nonNegative, nonNegative])),
})

export type SeamAccess = z.output<typeof seamAccessSchema>

const poseSchema = z.looseObject({ s: nonNegative, position: vec3Schema, quaternion: quatSchema })

const seamSchema = z.looseObject({
  id: z.string().min(1).meta({ description: 'Stable id of the seam.' }),
  label: z.string().min(1).meta({ description: 'Readable name of the seam.' }),
  source: z
    .enum(['crease', 'contact', 'intersection', 'nonmanifold', 'manual'])
    .meta({ description: 'How the seam was found.' }),
  confidence: z.number().min(0).max(1).meta({ description: 'The detector score from 0 to 1.' }),
  jointType: z.enum(['fillet', 'butt', 'lap', 'corner', 'saddle']).meta({ description: 'Joint type of the seam.' }),
  procedureId: z.string().min(1).meta({ description: 'Id of the procedure to use.' }),
  overrides: procedureOverridesSchema.meta({ description: 'Per-seam changes to the procedure, same keys as a procedure.' }),
  legMm: positiveNum.meta({ description: 'Fillet leg in mm.' }),
  throatMm: positiveNum.meta({ description: 'Fillet throat in mm, 0.707 x leg for equal legs.' }),
  passes: z
    .array(
      z.looseObject({
        index: z.int().min(1),
        lateralOffsetMm: num,
        verticalOffsetMm: num,
        workAngleOffsetDeg: num,
      }),
    )
    .min(1)
    .meta({ description: 'One entry per pass with lateral and vertical offsets and work-angle change.' }),
  intermittent: z
    .looseObject({ lengthMm: positiveNum, pitchMm: positiveNum })
    .nullable()
    .meta({ description: 'null for continuous, or segment length and pitch.' }),
  boxing: z
    .looseObject({ start: z.boolean(), end: z.boolean(), lengthMm: nonNegative })
    .meta({ description: 'Wrap around the start and/or end, with length.' }),
  closed: z.boolean().meta({ description: 'True for a loop, false for an open chain.' }),
  lengthMm: positiveNum.meta({ description: 'Length in mm after trimming.' }),
  direction: z.enum(['forward', 'reverse']).meta({ description: 'Direction relative to the stored points.' }),
  geometry: z
    .looseObject({
      openingAngleDeg: num,
      plateNormals: z.tuple([vec3Schema, vec3Schema]),
      plateThicknessMm: z.tuple([num.nullable(), num.nullable()]).optional(),
      start: vec3Schema,
      end: vec3Schema,
    })
    .meta({ description: 'Opening angle, the two plate normals, plate thickness behind each normal, start and end points.' }),
  position: z
    .looseObject({
      aws: z.enum(['1F', '2F', '3F', '4F']).nullable(),
      iso6947: z.string().min(1),
      inclinationDeg: num,
      rotationDeg: num,
    })
    .meta({ description: 'AWS and ISO 6947 position plus the two angles they were computed from.' }),
  poses: z.array(poseSchema).min(1).meta({
    description:
      's is arc length in mm; position is the TCP at the weld root in the part frame; quaternion is the tool orientation, x,y,z,w.',
  }),
  approach: z.looseObject({ distanceMm: nonNegative }).meta({ description: 'Distance along minus tool z before arc start.' }),
  retract: z.looseObject({ distanceMm: nonNegative }).meta({ description: 'Distance along minus tool z after arc end.' }),
  sensing: z
    .looseObject({
      touch: z.array(z.looseObject({ direction: vec3Schema, searchMm: positiveNum })),
      seamTracking: z.enum(['through-arc', 'none']),
    })
    .meta({ description: 'Touch-sensing searches (direction and distance) and seam tracking mode.' }),
  access: seamAccessSchema.meta({
    description: 'Free-cone clearance, class, port, reach coverage 0 to 1, unreachable arc-length intervals.',
  }),
  estimates: z
    .looseObject({ arcTimeS: nonNegative, heatInputKJmm: nonNegative, wireKg: nonNegative, gasL: nonNegative })
    .meta({ description: 'Arc time, heat input, wire mass, gas volume for this seam.' }),
  warnings: z.array(issueSchema).meta({ description: 'Seam-level warnings carried into the file.' }),
  points: z.array(seamPointSchema).optional().meta({
    description: 'The seam polyline with frames, unrounded, so the plan can be restored exactly.',
  }),
})

export const jobSchema = z
  .looseObject({
    $schema: z.string().meta({ description: 'Where the JSON Schema for this version lives.' }),
    format: z.literal('weld-job').meta({ description: 'Identifies the document type.' }),
    version: z.string().regex(/^1\.\d+\.\d+$/).meta({ description: 'Semver; minor versions only add optional fields.' }),
    id: z.string().min(1).meta({ description: 'Unique job id.' }),
    createdAt: z.iso.datetime().meta({ description: 'Creation time, ISO 8601 UTC.' }),
    generator: z.looseObject({ name: z.string().min(1), version: z.string().min(1) }).meta({ description: 'App name and version that wrote the file.' }),
    units: z
      .looseObject({
        length: z.literal('mm'),
        angle: z.literal('deg'),
        time: z.literal('s'),
        speed: z.literal('mm/s'),
        wireFeed: z.literal('m/min'),
        gasFlow: z.literal('L/min'),
        heatInput: z.literal('kJ/mm'),
        mass: z.literal('kg'),
      })
      .meta({ description: 'Units for every number in the file; consumers must read this, never assume.' }),
    frames: z
      .looseObject({
        convention: z.string().min(1),
        gravity: vec3Schema,
        partToCell: z.looseObject({ position: vec3Schema, quaternion: quatSchema }),
      })
      .meta({ description: 'Handedness and axis conventions, gravity in the part frame, and where the part sits in the cell.' }),
    part: z
      .looseObject({
        name: z.string().min(1),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
        sourceUnits: z.enum(['mm', 'in', 'm']),
        scaleToMm: positiveNum,
        triangles: z.int().min(0),
        bodies: z.int().min(0),
        boundingBox: z.looseObject({ min: vec3Schema, max: vec3Schema }),
      })
      .meta({ description: 'Source file name, SHA-256, source units and scale, triangle and body counts, bounding box.' }),
    settings: z
      .looseObject({ creaseAngleDeg: num, poseSpacingMm: positiveNum, airSpeedMmS: positiveNum, approachMm: nonNegative })
      .meta({ description: 'Detection and export settings used, so the file is reproducible.' }),
    procedures: z.array(procedureSchema).meta({ description: 'Reusable weld procedures referenced by seams.' }),
    seams: z.array(seamSchema).meta({ description: 'Every accepted seam, in no particular order.' }),
    sequence: z
      .looseObject({
        strategy: z.enum(['table-order', 'min-air-move', 'manual']),
        order: z.array(z.looseObject({ seamId: z.string().min(1), reversed: z.boolean() })),
        airMoves: z.array(z.looseObject({ from: z.string().min(1), to: z.string().min(1), lengthMm: nonNegative })),
      })
      .meta({ description: 'Strategy used, ordered seam list with direction, air moves.' }),
    access: z
      .looseObject({
        ports: z.array(z.looseObject({ id: z.string().min(1), position: vec3Schema, direction: vec3Schema, diameterMm: positiveNum })),
        arm: z.looseObject({}).nullable(),
      })
      .meta({ description: 'Access ports and snake-arm parameters used for reach analysis.' }),
    summary: z
      .looseObject({
        seamCount: z.int().min(0),
        weldLengthMm: nonNegative,
        arcTimeS: nonNegative,
        airTimeS: nonNegative,
        cycleTimeS: nonNegative,
        wireKg: nonNegative,
        gasL: nonNegative,
      })
      .meta({ description: 'Totals for quoting and checking.' }),
    validation: z
      .looseObject({ errors: z.array(issueSchema).max(0), warnings: z.array(issueSchema) })
      .meta({ description: 'Pre-flight errors (must be empty to export) and warnings, each with code, seamId and message.' }),
  })
  .superRefine((job, ctx) => {
    const procedureIds = new Set<string>()
    job.procedures.forEach((p, i) => {
      if (procedureIds.has(p.id)) ctx.addIssue({ code: 'custom', path: ['procedures', i, 'id'], message: `Procedure id ${p.id} is used twice.` })
      procedureIds.add(p.id)
    })

    const seamIds = new Set<string>()
    job.seams.forEach((seam, i) => {
      if (seamIds.has(seam.id)) ctx.addIssue({ code: 'custom', path: ['seams', i, 'id'], message: `Seam id ${seam.id} is used twice.` })
      seamIds.add(seam.id)
      if (!procedureIds.has(seam.procedureId)) {
        ctx.addIssue({ code: 'custom', path: ['seams', i, 'procedureId'], message: `Procedure ${seam.procedureId} is not in procedures.` })
      }
      seam.poses.forEach((pose, k) => {
        const previous = seam.poses[k - 1]
        if (k === 0 ? pose.s !== 0 : pose.s < previous!.s) {
          ctx.addIssue({
            code: 'custom',
            path: ['seams', i, 'poses', k, 's'],
            message: k === 0 ? 'The first pose must have s 0.' : 'Pose arc length must not decrease.',
          })
        }
      })
    })

    const listed = new Set<string>()
    job.sequence.order.forEach((entry, i) => {
      if (!seamIds.has(entry.seamId)) {
        ctx.addIssue({ code: 'custom', path: ['sequence', 'order', i, 'seamId'], message: `Seam ${entry.seamId} is not in seams.` })
      } else if (listed.has(entry.seamId)) {
        ctx.addIssue({ code: 'custom', path: ['sequence', 'order', i], message: `Seam ${entry.seamId} is listed twice.` })
      }
      listed.add(entry.seamId)
    })
    if ([...seamIds].some((id) => !listed.has(id))) {
      ctx.addIssue({ code: 'custom', path: ['sequence', 'order'], message: 'Every seam must appear in sequence.order exactly once.' })
    }
  })

export type WeldJob = z.output<typeof jobSchema>
