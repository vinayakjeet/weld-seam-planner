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
