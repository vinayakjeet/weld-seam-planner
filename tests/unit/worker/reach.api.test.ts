import { describe, expect, it } from 'vitest'
import { length, sub } from '../../../src/core/math/vec3'
import { DEFAULT_ARM } from '../../../src/core/snake/arm'
import { DEFAULT_DETECT_SETTINGS } from '../../../src/core/seams/detect'
import { createGeometryApi, type AccessOutcome, type SeamCandidate } from '../../../src/worker/geometry.api'
import { P1, posesOf, toolZOf } from '../helpers/snake'
import { approachGoal } from '../../../src/core/snake/ftl'
import { readManifest, readSample } from '../helpers/samples'
import { shown } from '../helpers/state'

type Ok = Extract<AccessOutcome, { status: 'ok' }>

async function loadedTank() {
  const api = createGeometryApi()
  const entry = readManifest().samples.find((s) => s.id === 'tank-with-manhole')!
  const loaded = await api.loadStl(readSample(entry.id), `${entry.id}.stl`, () => {})
  if (loaded.status === 'needs-units') await api.setUnits(entry.units, () => {})
  const detected = await api.detect(DEFAULT_DETECT_SETTINGS, () => {})
  if (detected.status !== 'ok') throw new Error('detect failed')
  const seams = shown(detected.seams)
  const access = (await api.access(seams, () => {})) as Ok
  const snake = seams.filter((seam) => access.results[seam.id]!.access.class === 'snake')
  return { api, seams, snake }
}

function explained(error: { what: string; why: string; next: string }) {
  for (const part of [error.what, error.why, error.next]) expect(part.trim().length).toBeGreaterThan(0)
  expect(`${error.what}${error.why}${error.next}`).not.toMatch(new RegExp('[\\u2013\\u2014]'))
}

describe('reach on the tank', () => {
  it('reaches the 20 snake seams from P1 in under 15 s, with progress up to 1', async () => {
    const { api, snake } = await loadedTank()
    expect(snake).toHaveLength(20)
    const events: Array<[string, number]> = []
    const outcome = await api.reach(snake, [P1], DEFAULT_ARM, (stage, fraction) => void events.push([stage, fraction]))
    expect(outcome.status).toBe('ok')
    if (outcome.status !== 'ok') return
    console.log(`tank reach in the worker api: ${outcome.ms.toFixed(0)} ms`)
    expect(outcome.ms).toBeLessThan(15_000)
    expect(Object.keys(outcome.results)).toHaveLength(20)
    expect(events.length).toBeGreaterThanOrEqual(2)
    expect(events.every(([stage]) => stage === 'reach')).toBe(true)
    expect(events[events.length - 1]![1]).toBe(1)
    const x746 = snake.find((s) => Math.abs(s.points[s.points.length >> 1]!.p[0] - 746) < 2 && Math.abs(s.lengthMm - 864) < 3)!
    expect(outcome.results[x746.id]!.coverage).toBeGreaterThan(0)
  }, 120_000)

  it('refuses to run without a port, saying what, why and what to do', async () => {
    const { api, snake } = await loadedTank()
    const outcome = await api.reach(snake, [], DEFAULT_ARM, () => {})
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') explained(outcome.error)
  })

  it('refuses to run with no part loaded', async () => {
    const outcome = await createGeometryApi().reach([], [P1], DEFAULT_ARM, () => {})
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') explained(outcome.error)
  })
})

describe('insertion on the tank', () => {
  const STATION_S = 630.72
  const x746 = (seams: SeamCandidate[]) => seams.find((s) => Math.abs(s.points[s.points.length >> 1]!.p[0] - 746) < 2 && Math.abs(s.lengthMm - 864) < 3)!

  it('returns frames whose last tip is the approach wrist at a reached station', async () => {
    const { api, snake } = await loadedTank()
    const seam = x746(snake)
    const outcome = await api.insertion(seam, STATION_S, P1, DEFAULT_ARM, 50)
    expect(outcome.status).toBe('ok')
    if (outcome.status !== 'ok') return
    const pose = posesOf(seam).find((p) => Math.abs(p.s - STATION_S) < 1e-6)!
    const wrist = approachGoal(pose.p, toolZOf(pose), DEFAULT_ARM, 50).wrist
    const last = outcome.frames[outcome.frames.length - 1]!
    expect(length(sub(last.joints[last.joints.length - 1]!, wrist))).toBeLessThan(2)
  })

  it('names the seam and the station when nothing reaches there', async () => {
    const { api, snake } = await loadedTank()
    const seam = x746(snake)
    const outcome = await api.insertion(seam, 0, P1, DEFAULT_ARM, 50)
    expect(outcome.status).toBe('error')
    if (outcome.status !== 'error') return
    explained(outcome.error)
    expect(`${outcome.error.what}${outcome.error.why}`).toContain(seam.label)
    expect(`${outcome.error.what}${outcome.error.why}`).toContain('0')
  })
})
