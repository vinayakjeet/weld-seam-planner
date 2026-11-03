import { describe, expect, it } from 'vitest'
import { FRAME_CONVENTION, JOB_UNITS, jobSchema, SCHEMA_URL } from '../../../src/core/job/schema'
import example from './fixtures/spec-example.json'

type Node = Record<string | number, unknown>
type Edit = [Array<string | number>, unknown]

// A copy of the example with values set at the given paths.
function changed(...edits: Edit[]): unknown {
  const root = structuredClone(example) as unknown
  for (const [path, value] of edits) {
    let node = root as Node
    for (const key of path.slice(0, -1)) node = node[key] as Node
    node[path[path.length - 1]!] = value
  }
  return root
}

function failingPaths(input: unknown): string[] {
  const r = jobSchema.safeParse(input)
  expect(r.success).toBe(false)
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'))
}

describe('jobSchema', () => {
  it('parses the spec example fixture', () => {
    const r = jobSchema.safeParse(example)
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues)).toBe(true)
  })

  it('exports the units and the frame convention of the spec', () => {
    expect(JOB_UNITS).toEqual(example.units)
    expect(FRAME_CONVENTION).toBe(example.frames.convention)
    expect(example.$schema).toBe(SCHEMA_URL)
  })

  it('reads an access object without nearClearanceDeg as null, so older files still validate', () => {
    const r = jobSchema.safeParse(example)
    expect(r.success && r.data.seams[0]!.access.nearClearanceDeg).toBeNull()
  })

  it('keeps nearClearanceDeg when the file has it', () => {
    const r = jobSchema.safeParse(changed([['seams', 0, 'access', 'nearClearanceDeg'], 45]))
    expect(r.success && r.data.seams[0]!.access.nearClearanceDeg).toBe(45)
  })

  it('reads the five field arm of the spec example with insertionMm 500 and clearanceMm 10', () => {
    const r = jobSchema.safeParse(example)
    expect(r.success && r.data.access.arm).toEqual({
      links: 24,
      linkLengthMm: 150,
      diameterMm: 80,
      maxBendDeg: 18,
      torchLengthMm: 250,
      insertionMm: 500,
      clearanceMm: 10,
    })
  })

  it('accepts a null arm and rejects a fractional link count, naming the field', () => {
    expect(jobSchema.safeParse(changed([['access', 'arm'], null])).success).toBe(true)
    expect(failingPaths(changed([['access', 'arm', 'links'], 2.5]))).toContain('access.arm.links')
  })

  it('rejects a quaternion of 3 numbers, naming the field', () => {
    const j = changed([['seams', 0, 'poses', 0, 'quaternion'], [0, 0, 1]])
    expect(failingPaths(j)).toContain('seams.0.poses.0.quaternion')
  })

  it('rejects a quaternion with w below 0', () => {
    const j = changed([['seams', 0, 'poses', 0, 'quaternion'], [0.9204, -0.0334, 0.0805, -0.3812]])
    expect(failingPaths(j).some((p) => p.startsWith('seams.0.poses.0.quaternion'))).toBe(true)
  })

  it('rejects a quaternion of length 1.1', () => {
    const j = changed([['seams', 0, 'poses', 0, 'quaternion'], [0, 0, 0, 1.1]])
    expect(failingPaths(j)).toContain('seams.0.poses.0.quaternion')
  })

  it('accepts a quaternion within 1e-4 of unit length', () => {
    const j = changed([['seams', 0, 'poses', 0, 'quaternion'], [0, 0, 0, 0.99995]])
    expect(jobSchema.safeParse(j).success).toBe(true)
  })

  it('rejects units.length "in"', () => {
    const j = changed([['units', 'length'], 'in'])
    expect(failingPaths(j)).toContain('units.length')
  })

  it('rejects an unknown procedureId, naming the seam field', () => {
    const j = changed([['seams', 0, 'procedureId'], 'WPS-NOPE'])
    expect(failingPaths(j)).toContain('seams.0.procedureId')
  })

  it('rejects a seam missing from sequence.order', () => {
    const j = changed([['sequence', 'order'], []])
    expect(failingPaths(j)).toContain('sequence.order')
  })

  it('rejects a seam listed twice in sequence.order', () => {
    const first = example.sequence.order[0]
    const j = changed([['sequence', 'order'], [first, first]])
    expect(failingPaths(j)).toContain('sequence.order.1')
  })

  it('rejects an order entry that is not a seam', () => {
    const j = changed([['sequence', 'order'], [...example.sequence.order, { seamId: 'S99', reversed: false }]])
    expect(failingPaths(j)).toContain('sequence.order.1.seamId')
  })

  it('rejects a first pose with s 5', () => {
    const j = changed([['seams', 0, 'poses', 0, 's'], 5], [['seams', 0, 'poses', 1, 's'], 6])
    expect(failingPaths(j)).toContain('seams.0.poses.0.s')
  })

  it('rejects poses whose s decreases', () => {
    const j = changed([['seams', 0, 'poses', 1, 's'], 900])
    expect(failingPaths(j)).toContain('seams.0.poses.2.s')
  })

  it('rejects non-empty validation.errors', () => {
    const j = changed([['validation', 'errors'], [{ code: 'NO_PROCEDURE', seamId: 'S07', message: 'x' }]])
    expect(failingPaths(j).some((p) => p.startsWith('validation.errors'))).toBe(true)
  })

  it('rejects a 63 character sha256', () => {
    const j = changed([['part', 'sha256'], example.part.sha256.slice(1)])
    expect(failingPaths(j)).toContain('part.sha256')
  })

  it('rejects version 2.0.0', () => {
    const j = changed([['version'], '2.0.0'])
    expect(failingPaths(j)).toContain('version')
  })

  it('rejects duplicate seam ids and duplicate procedure ids', () => {
    const a = changed([['seams'], [example.seams[0], example.seams[0]]])
    expect(failingPaths(a).some((p) => p.startsWith('seams.1.id'))).toBe(true)
    const b = changed([['procedures'], [example.procedures[0], example.procedures[0]]])
    expect(failingPaths(b)).toContain('procedures.1.id')
  })

  it('passes unknown fields at the top level and inside a seam', () => {
    const j = changed([['futureThing'], { a: 1 }], [['seams', 0, 'futureThing'], [1, 2]])
    expect(jobSchema.safeParse(j).success).toBe(true)
  })

  it('accepts the optional plateThicknessMm and points the builder writes', () => {
    const j = changed(
      [['seams', 0, 'geometry', 'plateThicknessMm'], [10, null]],
      [['seams', 0, 'points'], [{ s: 0, p: [0, 0, 0], t: [1, 0, 0], n1: [0, 0, 1], n2: [0, 1, 0] }]],
    )
    expect(jobSchema.safeParse(j).success).toBe(true)
  })

  it('describes the top level and seam fields from the spec tables', () => {
    expect(jobSchema.shape.units.meta()?.description).toBeTruthy()
    expect(jobSchema.shape.seams.element.shape.legMm.meta()?.description).toBeTruthy()
  })
})
