import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { buildJob } from '../../../src/core/job/build'
import { jobSchema, type WeldJob } from '../../../src/core/job/schema'
import { CREATED_AT, specExamplePlan } from '../helpers/jobs'

const SCRIPT = 'examples/consume_job.py'
const SPEC_FIXTURE = 'tests/unit/job/fixtures/spec-example.json'
const hasPython = spawnSync('python3', ['--version']).status === 0

function consume(path: string): string[] {
  const run = spawnSync('python3', ['-I', SCRIPT, path], { encoding: 'utf8' })
  expect(run.stderr).toBe('')
  expect(run.status).toBe(0)
  return run.stdout.trimEnd().split('\n')
}

const point = (xyz: readonly number[]) => `(${xyz.map((c) => c.toFixed(3)).join(', ')})`

// The documented reading: poses already run in weld direction, so the first pose is where the arc starts.
function expectedLines(job: WeldJob): string[] {
  const seams = new Map(job.seams.map((seam) => [seam.id, seam]))
  return job.sequence.order.map((entry, i) => {
    const seam = seams.get(entry.seamId)!
    const first = seam.poses[0]!.position
    const last = seam.poses[seam.poses.length - 1]!.position
    return `${i + 1}  ${seam.id}  ${seam.procedureId}  first=${point(first)}  last=${point(last)}  arc=${seam.estimates.arcTimeS.toFixed(1)} s  access=${seam.access.class ?? 'unknown'}`
  })
}

describe.skipIf(!hasPython)('consume_job.py', () => {
  const dir = mkdtempSync(join(tmpdir(), 'consume-job-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('prints one line per seam of the spec example, as the schema reads it', () => {
    const job = jobSchema.parse(JSON.parse(readFileSync(SPEC_FIXTURE, 'utf8')))
    expect(consume(SPEC_FIXTURE)).toEqual(expectedLines(job))
  })

  it('welds a reversed seam from its last stored point, without reversing the poses again', () => {
    const plan = specExamplePlan([
      { id: 's07', from: [1200, 300, 12], to: [2000, 300, 12] },
      { id: 's08', from: [1200, 600, 12], to: [1400, 600, 12] },
    ])
    plan.sequence = { strategy: 'manual', order: [{ seamId: 's08', reversed: true }, { seamId: 's07', reversed: false }] }
    const job = buildJob(plan, { createdAt: CREATED_AT })
    const path = join(dir, 'two-seams-reversed.json')
    writeFileSync(path, JSON.stringify(job))

    const lines = consume(path)
    expect(lines).toEqual(expectedLines(jobSchema.parse(job)))
    expect(job.sequence.order).toEqual([{ seamId: 's08', reversed: true }, { seamId: 's07', reversed: false }])
    expect(lines[0]).toContain('first=(1400.000, 600.000, 12.000)  last=(1200.000, 600.000, 12.000)')
    expect(lines[1]).toContain('first=(1200.000, 300.000, 12.000)  last=(2000.000, 300.000, 12.000)')
  })

  it('refuses a file that is not a weld job, saying what to do', () => {
    const path = join(dir, 'other.json')
    writeFileSync(path, JSON.stringify({ format: 'other' }))
    const run = spawnSync('python3', ['-I', SCRIPT, path], { encoding: 'utf8' })
    expect(run.status).not.toBe(0)
    expect(run.stderr).toMatch(/not a version 1 weld job.*Export the job again/)
  })
})
