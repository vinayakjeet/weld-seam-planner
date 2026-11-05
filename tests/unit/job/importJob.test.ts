import { describe, expect, it } from 'vitest'
import { buildJob } from '../../../src/core/job/build'
import { importJob } from '../../../src/core/job/importJob'
import type { Explained, Plan } from '../../../src/core/job/plan'
import { DEFAULT_ARM, type Port } from '../../../src/core/snake/arm'
import { splitSeam } from '../../../src/core/seams/manual'
import { CREATED_AT, samplePlan, specExamplePlan } from '../helpers/jobs'

const opts = { createdAt: CREATED_AT }
const spec = () => specExamplePlan()
const specJob = () => buildJob(spec(), opts)
const SHA = 'a'.repeat(64)

function refused(result: ReturnType<typeof importJob>): Explained {
  expect(result.status).toBe('error')
  if (result.status !== 'error') throw new Error('expected a refusal')
  for (const part of [result.error.what, result.error.why, result.error.next]) expect(part.trim().length).toBeGreaterThan(0)
  expect(`${result.error.what}${result.error.why}${result.error.next}`).not.toMatch(new RegExp('[\\u2013\\u2014]'))
  return result.error
}

describe('importJob refusals', () => {
  it('refuses text that is not JSON', () => {
    expect(refused(importJob('not json {', SHA)).what).toMatch(/not JSON/i)
  })

  it('refuses JSON of another format', () => {
    expect(refused(importJob({ format: 'something-else' }, SHA)).what).toMatch(/weld job/i)
    expect(refused(importJob('[1, 2]', SHA)).what).toMatch(/weld job/i)
    expect(refused(importJob('null', SHA)).what).toMatch(/weld job/i)
  })

  it('refuses version 2.0.0', () => {
    const error = refused(importJob({ ...specJob(), version: '2.0.0' }, SHA))
    expect(error.what).toContain('2.0.0')
  })

  it('lists at most 3 paths when the schema fails', () => {
    const job = JSON.parse(JSON.stringify(specJob()))
    job.units.length = 'in'
    job.part.sha256 = 'zz'
    job.seams[0].legMm = -1
    job.seams[0].throatMm = -1
    job.generator = {}
    const error = refused(importJob(job, SHA))
    const paths = error.why.match(/[a-zA-Z]+(\.[a-zA-Z0-9]+)+/g) ?? []
    expect(paths.length).toBeGreaterThan(0)
    expect(paths.length).toBeLessThanOrEqual(3)
    expect(error.why).toMatch(/more/)
  })

  it('refuses a plan of another part, showing 8 characters of each hash', () => {
    const error = refused(importJob(specJob(), 'b'.repeat(64)))
    expect(error.what).toBe('This plan belongs to a different part.')
    expect(error.why).toContain('aaaaaaaa')
    expect(error.why).toContain('bbbbbbbb')
    expect(error.why).not.toContain('aaaaaaaaa')
    expect(error.next).toBe('Open the STL it was made for, then import the plan again.')
  })

  it('refuses a seam without points, naming its label', () => {
    const job = JSON.parse(JSON.stringify(specJob()))
    delete job.seams[0].points
    expect(refused(importJob(job, SHA)).what).toContain('S07')
  })
})

describe('importJob', () => {
  it('imports unknown extra fields cleanly', () => {
    const job = JSON.parse(JSON.stringify(specJob()))
    job.futureThing = { a: 1 }
    job.seams[0].futureThing = [1]
    expect(importJob(job, SHA).status).toBe('ok')
  })

  it('reads a job written before cleaning was modelled as no cleaning', () => {
    const job = JSON.parse(JSON.stringify(specJob()))
    delete job.settings.cleanEveryS
    delete job.settings.cleanTimeS
    delete job.summary.torchCleanings
    delete job.summary.cleaningTimeS
    const r = importJob(job, SHA)
    if (r.status !== 'ok') throw new Error(r.error.what)
    expect(r.plan.settings).toMatchObject({ cleanEveryS: 0, cleanTimeS: 30 })
  })

  it('accepts the job as a string or as an object', () => {
    expect(importJob(JSON.stringify(specJob()), SHA).status).toBe('ok')
    expect(importJob(specJob(), SHA).status).toBe('ok')
  })

  it('restores the plan: part, gravity, settings, procedures, seams, set legs', () => {
    const plan = spec()
    plan.seams[0]!.legMm = 7
    plan.seams[0]!.overrides = { electrical: { currentA: 250 } }
    const r = importJob(buildJob(plan, opts), SHA)
    if (r.status !== 'ok') throw new Error(r.error.what)
    const back = r.plan
    expect(back.part.sha256).toBe(SHA)
    expect(back.part.bbox).toEqual(plan.part.bbox)
    expect(back.gravity).toEqual([0, 0, -1])
    expect(back.settings).toEqual(plan.settings)
    expect(back.procedures.map((p) => p.id)).toEqual(['WPS-GMAW-SPRAY-FW6'])
    expect(back.seams).toHaveLength(1)
    expect(back.seams[0]!.legMm).toBe(7)
    expect(back.seams[0]!.overrides).toEqual({ electrical: { currentA: 250 } })
    expect(back.seams[0]!.procedureId).toBe('WPS-GMAW-SPRAY-FW6')
    expect(back.seams[0]!.seam.points).toEqual(plan.seams[0]!.seam.points)
    expect(back.seams[0]!.seam.thicknessMm).toEqual([12, 12])
  })

  it('keeps a default leg as a default, so a later procedure change still moves it', () => {
    const r = importJob(buildJob(spec(), opts), SHA)
    if (r.status !== 'ok') throw new Error(r.error.what)
    expect(r.plan.seams[0]!.legMm).toBeNull()
  })
})

describe('sequence', () => {
  const two = (): Plan => ({
    ...specExamplePlan([
      { id: 's1', from: [0, 0, 0], to: [100, 0, 0] },
      { id: 's2', from: [0, 200, 0], to: [100, 200, 0] },
    ]),
    sequence: { strategy: 'balanced-heat', order: [{ seamId: 's2', reversed: true }, { seamId: 's1', reversed: false }] },
  })

  it('restores the exported sequence into the plan', () => {
    const r = importJob(JSON.stringify(buildJob(two(), opts)), SHA)
    if (r.status !== 'ok') throw new Error(r.error.what)
    expect(r.plan.sequence).toEqual({ strategy: 'balanced-heat', order: [{ seamId: 's2', reversed: true }, { seamId: 's1', reversed: false }] })
    expect(r.plan.seams.map((p) => p.seam.id)).toEqual(['s2', 's1'])
  })

  it('is byte identical when seams are reordered and one is reversed', () => {
    const job = buildJob(two(), opts)
    const r = importJob(JSON.stringify(job), SHA)
    if (r.status !== 'ok') throw new Error(r.error.what)
    expect(JSON.stringify(buildJob(r.plan, opts))).toBe(JSON.stringify(job))
  })

  it('restores the stored points of a reversed seam, so it is not reversed twice', () => {
    const r = importJob(JSON.stringify(buildJob(two(), opts)), SHA)
    if (r.status !== 'ok') throw new Error(r.error.what)
    const s2 = r.plan.seams.find((p) => p.seam.id === 's2')!
    expect(s2.seam.points[0]!.p).toEqual([0, 200, 0])
  })
})

describe('round trip', () => {
  const roundTrip = (plan: Plan) => {
    const job = buildJob(plan, opts)
    const r = importJob(JSON.stringify(job), plan.part.sha256)
    if (r.status !== 'ok') throw new Error(r.error.what)
    return { text: JSON.stringify(job), again: JSON.stringify(buildJob(r.plan, opts)) }
  }

  it('is byte identical for t-joint-merged', () => {
    const { text, again } = roundTrip(samplePlan('t-joint-merged'))
    expect(again).toBe(text)
  })

  it('is byte identical for pipe-on-plate', () => {
    const { text, again } = roundTrip(samplePlan('pipe-on-plate'))
    expect(again).toBe(text)
  })

  it('is byte identical for double-bottom-cell with a split seam, an override and a set leg of 7', () => {
    const plan = samplePlan('double-bottom-cell', (p) => {
      const first = p.seams[0]!
      const parts = splitSeam(first.seam, first.seam.lengthMm / 2)
      if ('what' in parts) throw new Error(parts.what)
      const children = parts.map((seam) => ({ ...first, seam }))
      const seams = [...children, ...p.seams.slice(1)]
      seams[2] = { ...seams[2]!, overrides: { electrical: { currentA: 260 } } }
      seams[3] = { ...seams[3]!, legMm: 7 }
      return { ...p, seams }
    })
    const { text, again } = roundTrip(plan)
    expect(again).toBe(text)
    expect(JSON.parse(text).seams[3].legMm).toBe(7)
  })
})

describe('importJob access', () => {
  const P1: Port = { id: 'P1', position: [400, 500, 1000], direction: [0, 0, -1], diameterMm: 600 }
  const arm = { ...DEFAULT_ARM, maxBendDeg: 25 }

  it('round trips the ports and the arm', () => {
    const job = buildJob({ ...spec(), access: { ports: [P1], arm } }, opts)
    const result = importJob(JSON.parse(JSON.stringify(job)), 'a'.repeat(64))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.plan.access).toEqual({ ports: [P1], arm })
  })

  it('imports the default arm when the file has none, and the ports as given', () => {
    const job = JSON.parse(JSON.stringify(buildJob({ ...spec(), access: { ports: [], arm: DEFAULT_ARM } }, opts)))
    expect(job.access.arm).toBeNull()
    job.access.ports = [P1]
    const result = importJob(job, 'a'.repeat(64))
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.plan.access).toEqual({ ports: [P1], arm: DEFAULT_ARM })
  })
})
