import { z } from 'zod'
import { DEFAULT_WELD_TOLERANCE, WELD_TOLERANCE_RANGE } from '../mesh/weld'
import { PROCESSES } from '../process/heatInput'
import { SEQUENCE_STRATEGIES } from '../sequence/types'

export const ISO_POSITIONS = ['PA', 'PB', 'PC', 'PD', 'PE', 'PF', 'PG'] as const

const about = (description: string) => ({ description })

const baseMaterialSchema = z.looseObject({
  spec: z.string().min(1).meta(about('Base material designation, for example S355.')),
  thicknessMm: z
    .tuple([z.number().positive(), z.number().positive()])
    .refine(([lo, hi]) => lo <= hi, { message: 'The thickness range must run from the smaller to the larger value.' })
    .meta(about('Plate thickness range in mm this procedure is qualified for, smaller value first.')),
})

const wireSchema = z.looseObject({
  classification: z.string().min(1).meta(about('Filler wire classification, for example ER70S-6.')),
  diameterMm: z.number().positive().meta(about('Wire diameter in mm.')),
})

const gasSchema = z.looseObject({
  mix: z.string().min(1).meta(about('Shielding gas mix, for example Ar 82 / CO2 18.')),
  flowLpm: z.number().positive().meta(about('Gas flow in L/min.')),
})

const electricalSchema = z.looseObject({
  currentA: z.number().positive().meta(about('Welding current in A.')),
  voltageV: z.number().positive().meta(about('Arc voltage in V.')),
  wireFeedMpm: z.number().positive().optional().meta(about('Wire feed speed in m/min; wire mass is estimated from it when present.')),
  polarity: z.enum(['DCEP', 'DCEN', 'AC']).meta(about('Electrode polarity.')),
})

const torchSchema = z.looseObject({
  workAngleOffsetDeg: z.number().meta(about('Tilt of the torch away from the joint bisector, across the seam, in degrees.')),
  travelAngleDeg: z.number().min(0).meta(about('Lean of the torch along the seam in degrees, always 0 or more; technique gives its sense.')),
  technique: z.enum(['push', 'drag']).meta(about('push leans the torch forward along travel, drag leans it back.')),
})

const weaveSchema = z.looseObject({
  pattern: z.enum(['none', 'zigzag', 'triangle', 'circle']).meta(about('Weave pattern, none for a straight bead.')),
  amplitudeMm: z.number().min(0).meta(about('Weave amplitude in mm.')),
  frequencyHz: z.number().min(0).meta(about('Weave frequency in Hz.')),
  dwellMs: z.number().min(0).meta(about('Dwell at each edge of the weave in ms.')),
})

const arcStartSchema = z.looseObject({ preflowS: z.number().min(0).meta(about('Gas flow before the arc strikes, in seconds.')) })

const arcEndSchema = z.looseObject({
  craterFillS: z.number().min(0).meta(about('Crater fill time at the end of the seam, in seconds.')),
  burnbackMs: z.number().min(0).meta(about('Wire burnback after the arc stops, in ms.')),
  postflowS: z.number().min(0).meta(about('Gas flow after the arc stops, in seconds.')),
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
  travelSpeedMmS: procedureSchema.shape.travelSpeedMmS.optional(),
  ctwdMm: procedureSchema.shape.ctwdMm.optional(),
  torch: torchSchema.partial().optional(),
  weave: weaveSchema.partial().optional(),
  arcStart: arcStartSchema.partial().optional(),
  arcEnd: arcEndSchema.partial().optional(),
  positions: procedureSchema.shape.positions.optional(),
  thermalEfficiency: procedureSchema.shape.thermalEfficiency.optional(),
  preheatC: procedureSchema.shape.preheatC.optional(),
  interpassMaxC: procedureSchema.shape.interpassMaxC.optional(),
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
  code: z.string().min(1).meta(about('Stable machine-readable code, for example LEG_OUT_OF_RANGE.')),
  seamId: z.string().nullable().meta(about('The seam the issue is about, null when it concerns the whole job.')),
  message: z.string().min(1).meta(about('Readable explanation: what happened, why, and what to do next.')),
})

export type JobIssue = z.output<typeof issueSchema>

export const seamPointSchema = z.looseObject({
  s: nonNegative.meta(about('Arc length in mm along the stored points from the first point.')),
  p: vec3Schema.meta(about('Point on the weld root in mm, part frame.')),
  t: vec3Schema.meta(about('Unit tangent along the stored points.')),
  n1: vec3Schema.meta(about('Unit outward normal of the first plate.')),
  n2: vec3Schema.meta(about('Unit outward normal of the second plate.')),
})

export const portSchema = z.looseObject({
  id: z.string().min(1).meta(about('Port id referenced by seams[].access.portId.')),
  position: vec3Schema.meta(about('Centre of the port opening in mm, part frame.')),
  direction: vec3Schema.meta(about('Unit direction the arm enters along, into the part.')),
  diameterMm: positiveNum.meta(about('Clear diameter of the opening in mm.')),
})

export type JobPort = z.output<typeof portSchema>

// The spec lists five arm fields; insertionMm and clearanceMm are the planner's own and default when a file has none.
export const armSchema = z.looseObject({
  links: z.int().min(1).meta(about('Number of links in the snake arm.')),
  linkLengthMm: positiveNum.meta(about('Length of one link in mm.')),
  diameterMm: positiveNum.meta(about('Outer diameter of the arm in mm.')),
  maxBendDeg: positiveNum.meta(about('Largest bend between two neighbouring links in degrees.')),
  torchLengthMm: nonNegative.meta(about('Torch length from the last link to the contact tip in mm.')),
  insertionMm: nonNegative.default(500).meta(about('Longest straight feed in mm along the port axis before the links bend; the solver picks a depth up to it.')),
  clearanceMm: nonNegative.default(10).meta(about('Gap in mm added to the link radius when the arm is checked for collisions with the part.')),
})

export const seamAccessSchema = z.looseObject({
  clearanceDeg: num.nullable().meta(about('Smallest free cone half-angle in degrees around the torch axis out to 300 mm, over the poses of the seam; null before access was analysed.')),
  nearClearanceDeg: num
    .nullable()
    .default(null)
    .meta(about('The same free cone measured only out to 60 mm, the room the snake arm nozzle needs; null in files written before the field existed.')),
  class: z
    .enum(['standard', 'slim', 'snake', 'blocked'])
    .nullable()
    .meta(about('Which tool reaches the seam: a standard torch, a slim torch, the snake arm through a port, or none.')),
  portId: z.string().nullable().meta(about('The access port the snake arm enters through, null for other classes.')),
  reachCoverage: z.number().min(0).max(1).nullable().meta(about('Share of the seam length the arm reaches, 0 to 1, null before reach was run.')),
  unreachable: z
    .array(z.tuple([nonNegative, nonNegative]))
    .meta(about('Arc-length intervals [from, to] in mm the arm cannot reach, measured like poses[].s along the travel direction.')),
})

export type SeamAccess = z.output<typeof seamAccessSchema>

const poseSchema = z.looseObject({
  s: nonNegative.meta(about('Arc length in mm from the arc start, along the travel direction; 0 at the first pose.')),
  position: vec3Schema.meta(about('TCP at the weld root in mm, part frame.')),
  quaternion: quatSchema.meta(about('Tool orientation as a unit quaternion x, y, z, w with w of at least 0; tool z points from the torch into the joint, tool x along travel.')),
})

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
        index: z.int().min(1).meta(about('Pass number, 1 for the root pass.')),
        lateralOffsetMm: num.meta(about('Offset of this pass across the seam in mm, along tool y.')),
        verticalOffsetMm: num.meta(about('Offset of this pass away from the root in mm, along minus tool z.')),
        workAngleOffsetDeg: num.meta(about('Change of the work angle for this pass in degrees.')),
      }),
    )
    .min(1)
    .meta({ description: 'One entry per pass with lateral and vertical offsets and work-angle change.' }),
  intermittent: z
    .looseObject({
      lengthMm: positiveNum.meta(about('Length of each welded segment in mm.')),
      pitchMm: positiveNum.meta(about('Distance from the start of one segment to the start of the next in mm.')),
    })
    .nullable()
    .meta({ description: 'null for continuous, or segment length and pitch.' }),
  boxing: z
    .looseObject({
      start: z.boolean().meta(about('True to wrap the weld around the start of the seam.')),
      end: z.boolean().meta(about('True to wrap the weld around the end of the seam.')),
      lengthMm: nonNegative.meta(about('Length of each wrap in mm.')),
    })
    .meta({ description: 'Wrap around the start and/or end, with length.' }),
  closed: z.boolean().meta({ description: 'True for a loop, false for an open chain.' }),
  lengthMm: positiveNum.meta({ description: 'Length in mm after trimming.' }),
  direction: z.enum(['forward', 'reverse']).meta({ description: 'reverse when the seam is welded against its stored points, forward otherwise; it matches sequence.order[].reversed.' }),
  geometry: z
    .looseObject({
      openingAngleDeg: num.meta(about('Angle between the two plate faces on the side the torch works from, 180 minus the angle between the normals, length weighted, in degrees; 90 for a square T.')),
      plateNormals: z.tuple([vec3Schema, vec3Schema]).meta(about('Unit outward normals of the two plates at the middle of the seam.')),
      plateThicknessMm: z
        .tuple([num.nullable(), num.nullable()])
        .optional()
        .meta(about('Thickness in mm of the plate behind each normal, null where it could not be measured.')),
      start: vec3Schema.meta(about('Where the weld starts in mm, part frame; the first pose position.')),
      end: vec3Schema.meta(about('Where the weld ends in mm, part frame; equal to start for a closed seam.')),
    })
    .meta({ description: 'Opening angle, the two plate normals, plate thickness behind each normal, start and end points.' }),
  position: z
    .looseObject({
      aws: z.enum(['1F', '2F', '3F', '4F']).nullable().meta(about('AWS fillet position, null when the ISO position has no AWS fillet name.')),
      iso6947: z.string().min(1).meta(about('ISO 6947 position that covers most of the seam length, for example PB.')),
      inclinationDeg: num.meta(about('Weld axis inclination from horizontal in degrees, length weighted over the dominant position.')),
      rotationDeg: num.meta(about('Rotation of the weld face about the weld axis in degrees, a circular mean over the dominant position.')),
    })
    .meta({ description: 'AWS and ISO 6947 position plus the two angles they were computed from.' }),
  poses: z.array(poseSchema).min(1).meta({
    description:
      'Tool poses in the order they are welded, along the travel direction: already reversed for a seam welded against its stored points. s is arc length in mm; position is the TCP at the weld root in the part frame; quaternion is the tool orientation, x,y,z,w.',
  }),
  approach: z.looseObject({ distanceMm: nonNegative.meta(about('Approach distance in mm.')) }).meta({ description: 'Distance along minus tool z before arc start.' }),
  retract: z.looseObject({ distanceMm: nonNegative.meta(about('Retract distance in mm.')) }).meta({ description: 'Distance along minus tool z after arc end.' }),
  sensing: z
    .looseObject({
      touch: z
        .array(
          z.looseObject({
            direction: vec3Schema.meta(about('Unit search direction, towards the plate it finds.')),
            searchMm: positiveNum.meta(about('Longest search distance in mm.')),
          }),
        )
        .meta(about('Touch-sensing searches to run before the arc starts, one per plate.')),
      seamTracking: z.enum(['through-arc', 'none']).meta(about('through-arc tracking while welding, or none (GTAW).')),
    })
    .meta({ description: 'Touch-sensing searches (direction and distance) and seam tracking mode.' }),
  access: seamAccessSchema.meta({
    description: 'Free-cone clearance, class, port, reach coverage 0 to 1, unreachable arc-length intervals.',
  }),
  estimates: z
    .looseObject({
      arcTimeS: nonNegative.meta(about('Arc-on time in seconds: passes x length / travel speed.')),
      heatInputKJmm: nonNegative.meta(about('Heat input in kJ/mm: k x V x I / (1000 x travel speed in mm/s).')),
      wireKg: nonNegative.meta(about('Wire mass in kg from wire feed speed, wire diameter and arc time; 0 without a wire feed speed.')),
      gasL: nonNegative.meta(about('Gas volume in L over pre-flow, arc time and post-flow; 0 without a gas.')),
    })
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
    generator: z
      .looseObject({
        name: z.string().min(1).meta(about('Name of the app that wrote the file.')),
        version: z.string().min(1).meta(about('Version of that app.')),
      })
      .meta({ description: 'App name and version that wrote the file.' }),
    units: z
      .looseObject({
        length: z.literal('mm').meta(about('Lengths and positions.')),
        angle: z.literal('deg').meta(about('Every angle; quaternions are unitless.')),
        time: z.literal('s').meta(about('Times, except fields whose name ends in Ms.')),
        speed: z.literal('mm/s').meta(about('Travel and air speeds.')),
        wireFeed: z.literal('m/min').meta(about('Wire feed speed.')),
        gasFlow: z.literal('L/min').meta(about('Shielding gas flow.')),
        heatInput: z.literal('kJ/mm').meta(about('Heat input.')),
        mass: z.literal('kg').meta(about('Wire mass.')),
      })
      .meta({ description: 'Units for every number in the file; consumers must read this, never assume.' }),
    frames: z
      .looseObject({
        convention: z.string().min(1).meta(about('Readable statement of handedness, quaternion order and tool axes.')),
        gravity: vec3Schema.meta(about('Unit gravity direction in the part frame; welding positions are computed from it.')),
        partToCell: z
          .looseObject({
            position: vec3Schema.meta(about('Part origin in the cell frame, in mm.')),
            quaternion: quatSchema.meta(about('Part orientation in the cell frame, x, y, z, w.')),
          })
          .meta(about('Where the part sits in the cell.')),
      })
      .meta({ description: 'Handedness and axis conventions, gravity in the part frame, and where the part sits in the cell.' }),
    part: z
      .looseObject({
        name: z.string().min(1).meta(about('File name of the STL the plan was made on.')),
        sha256: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .meta(about('SHA-256 of the STL bytes in lowercase hex; a plan is only restored onto the same file.')),
        sourceUnits: z.enum(['mm', 'in', 'm']).meta(about('Units the STL was drawn in.')),
        scaleToMm: positiveNum.meta(about('Factor that took the STL coordinates to mm.')),
        triangles: z.int().min(0).meta(about('Triangle count after welding vertices and dropping degenerate triangles.')),
        bodies: z.int().min(0).meta(about('Number of separate connected bodies.')),
        boundingBox: z
          .looseObject({
            min: vec3Schema.meta(about('Smallest corner in mm, part frame.')),
            max: vec3Schema.meta(about('Largest corner in mm, part frame.')),
          })
          .meta(about('Axis-aligned bounding box of the part.')),
      })
      .meta({ description: 'Source file name, SHA-256, source units and scale, triangle and body counts, bounding box.' }),
    settings: z
      .looseObject({
        creaseAngleDeg: num.meta(about('Bend in degrees between neighbouring faces above which an edge counts as a crease.')),
        poseSpacingMm: positiveNum.meta(about('Arc length in mm between two exported poses.')),
        airSpeedMmS: positiveNum.meta(about('Torch speed for air moves in mm/s, used for air time.')),
        approachMm: nonNegative.meta(about('Approach and retract distance in mm along minus tool z.')),
        cleanEveryS: nonNegative.optional().meta({ description: 'Arc time between torch cleaning stops in seconds, 0 for none. Absent in files written before cleaning was modelled.' }),
        cleanTimeS: nonNegative.optional().meta({ description: 'Duration of one torch cleaning stop in seconds.' }),
        weldToleranceRel: z
          .number()
          .min(WELD_TOLERANCE_RANGE.min)
          .max(WELD_TOLERANCE_RANGE.max)
          .default(DEFAULT_WELD_TOLERANCE)
          .meta({
            description:
              'Vertex weld tolerance as a fraction of the part bounding box diagonal; the seams were detected on the part welded at it. Absent in files written before it was stored, which used 1e-5.',
          }),
      })
      .meta({ description: 'Detection and export settings used, so the file is reproducible.' }),
    procedures: z.array(procedureSchema).meta({ description: 'Reusable weld procedures referenced by seams.' }),
    seams: z.array(seamSchema).meta({ description: 'Every accepted seam, in no particular order.' }),
    sequence: z
      .looseObject({
        strategy: z.enum(SEQUENCE_STRATEGIES).meta(about('How the order was chosen.')),
        order: z
          .array(
            z.looseObject({
              seamId: z.string().min(1).meta(about('Id of a seam in seams.')),
              reversed: z
                .boolean()
                .meta(
                  about(
                    'True when the seam is welded against its stored points. Its poses, geometry.start and geometry.end already follow the travel direction, so weld the poses in the order given and never reverse them again.',
                  ),
                ),
            }),
          )
          .meta(about('Weld order: every seam exactly once.')),
        airMoves: z
          .array(
            z.looseObject({
              from: z.string().min(1).meta(about('Seam id the move leaves, or home.')),
              to: z.string().min(1).meta(about('Seam id the move enters, or home.')),
              lengthMm: nonNegative.meta(about('Path length in mm, including the retract and approach.')),
            }),
          )
          .meta(about('Moves with the arc off: home to the first seam, between seams in order, and the last seam back home.')),
      })
      .meta({ description: 'Strategy used, ordered seam list with direction, air moves.' }),
    access: z
      .looseObject({
        ports: z.array(portSchema).meta(about('Openings the snake arm can enter through.')),
        arm: armSchema.nullable().meta(about('Snake-arm parameters, null when the job has no port.')),
      })
      .meta({ description: 'Access ports and snake-arm parameters used for reach analysis.' }),
    summary: z
      .looseObject({
        seamCount: z.int().min(0).meta(about('Number of seams in the job.')),
        weldLengthMm: nonNegative.meta(about('Sum of the seam lengths in mm.')),
        arcTimeS: nonNegative.meta(about('Sum of the seam arc times in seconds.')),
        airTimeS: nonNegative.meta(about('Sum of the air move lengths over the air speed, in seconds.')),
        cycleTimeS: nonNegative.meta({ description: 'Arc time, air time, arc start and end times and torch cleaning stops.' }),
        torchCleanings: z.int().min(0).optional().meta({ description: 'Number of torch cleaning stops in the cycle time.' }),
        cleaningTimeS: nonNegative.optional().meta({ description: 'Total time of the torch cleaning stops, included in cycleTimeS.' }),
        wireKg: nonNegative.meta(about('Total wire mass in kg.')),
        gasL: nonNegative.meta(about('Total gas volume in L.')),
      })
      .meta({ description: 'Totals for quoting and checking.' }),
    validation: z
      .looseObject({
        errors: z.array(issueSchema).max(0).meta(about('Always empty: a job with pre-flight errors is not exported.')),
        warnings: z.array(issueSchema).meta(about('Pre-flight warnings the user exported with.')),
      })
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
