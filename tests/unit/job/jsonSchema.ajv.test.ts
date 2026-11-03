import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020'
import { describe, expect, it } from 'vitest'
import { buildJob } from '../../../src/core/job/build'
import { CREATED_AT, samplePlan, specExamplePlan } from '../helpers/jobs'
import { readManifest } from '../helpers/samples'

const SCHEMA_FILE = fileURLToPath(new URL('../../../public/schema/weld-job-1.0.json', import.meta.url))
const FIXTURE_FILE = fileURLToPath(new URL('./fixtures/spec-example.json', import.meta.url))

const ajv = new Ajv2020({ allErrors: true, validateFormats: false, strict: true })
const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA_FILE, 'utf8')) as object)

function errorsFor(doc: unknown): string[] {
  validate(doc)
  return (validate.errors ?? []).map((e) => e.instancePath)
}

type Doc = { units: { length: string }; seams: Array<{ poses?: Array<{ quaternion: number[] }> }> }

function plain(plan = specExamplePlan()): Doc {
  return JSON.parse(JSON.stringify(buildJob(plan, { createdAt: CREATED_AT }, []))) as Doc
}

describe('weld-job-1.0.json under ajv', () => {
  it('compiles in strict mode', () => {
    expect(typeof validate).toBe('function')
  })

  for (const sample of readManifest().samples) {
    it(`validates the job built from ${sample.id}`, () => {
      const job = JSON.parse(JSON.stringify(buildJob(samplePlan(sample.id), { createdAt: CREATED_AT }, [])))
      expect(errorsFor(job)).toEqual([])
    })
  }

  it('validates the spec example fixture', () => {
    expect(errorsFor(JSON.parse(readFileSync(FIXTURE_FILE, 'utf8')))).toEqual([])
  })

  it('rejects a quaternion with 3 numbers at that pose', () => {
    const job = plain()
    job.seams[0]!.poses![0]!.quaternion = [0, 0, 0]
    expect(errorsFor(job)).toContain('/seams/0/poses/0/quaternion')
  })

  it('rejects units.length "in" at /units/length', () => {
    const job = plain()
    job.units.length = 'in'
    expect(errorsFor(job)).toContain('/units/length')
  })

  it('rejects a seam without poses at that seam', () => {
    const job = plain()
    delete job.seams[0]!.poses
    expect(errorsFor(job)).toContain('/seams/0')
  })
})
