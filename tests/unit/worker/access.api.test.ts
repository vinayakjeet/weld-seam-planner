import { describe, expect, it } from 'vitest'
import { DEFAULT_DETECT_SETTINGS } from '../../../src/core/seams/detect'
import { createGeometryApi, type AccessOutcome, type SeamCandidate } from '../../../src/worker/geometry.api'
import { shown } from '../helpers/state'
import { readManifest, readSample } from '../helpers/samples'

type Ok = Extract<AccessOutcome, { status: 'ok' }>

async function analyse(id: string, onProgress: (stage: string, fraction: number) => void = () => {}) {
  const api = createGeometryApi()
  const entry = readManifest().samples.find((s) => s.id === id)!
  const loaded = await api.loadStl(readSample(id), `${id}.stl`, () => {})
  if (loaded.status === 'needs-units') await api.setUnits(entry.units, () => {})
  const detected = await api.detect(DEFAULT_DETECT_SETTINGS, () => {})
  if (detected.status !== 'ok') throw new Error('detect failed')
  const seams = shown(detected.seams)
  const outcome = await api.access(seams, onProgress)
  if (outcome.status !== 'ok') throw new Error(`access failed: ${JSON.stringify(outcome)}`)
  return { seams, outcome: outcome as Ok }
}

function histogram(seams: SeamCandidate[], outcome: Ok): Record<string, number> {
  const out: Record<string, number> = {}
  for (const seam of seams) {
    const cls = outcome.results[seam.id]!.access.class!
    out[cls] = (out[cls] ?? 0) + 1
  }
  return out
}

const mid = (seam: SeamCandidate) => seam.points[seam.points.length >> 1]!.p

describe('access on the generated samples', () => {
  it.each(['t-joint-merged', 't-joint-assembly', 't-joint-inch', 't-joint-ascii', 'flipped-normals', 'bar-through-plate'])(
    '%s: every seam is standard with a wide far cone',
    async (id) => {
      const { seams, outcome } = await analyse(id)
      expect(histogram(seams, outcome)).toEqual({ standard: seams.length })
      for (const seam of seams) expect(outcome.results[seam.id]!.access.clearanceDeg).toBeGreaterThanOrEqual(40)
    },
  )

  it('box-beam: 4 outside fillets are standard, 4 inside corners are snake (far 0, near 45)', async () => {
    const { seams, outcome } = await analyse('box-beam')
    expect(histogram(seams, outcome)).toEqual({ standard: 4, snake: 4 })
    for (const seam of seams) {
      const { access } = outcome.results[seam.id]!
      if (Math.abs(Math.abs(mid(seam)[1]) - 75) < 1) {
        expect(access).toMatchObject({ class: 'standard', clearanceDeg: 35, nearClearanceDeg: 45 })
      } else {
        expect(Math.abs(Math.abs(mid(seam)[1]) - 65)).toBeLessThan(1)
        expect(access).toMatchObject({ class: 'snake', clearanceDeg: 0, nearClearanceDeg: 45, unreachable: [] })
      }
    }
  })

  it('pipe-on-plate: the outer loop is standard, the 38 mm bore loop is blocked', async () => {
    const { seams, outcome } = await analyse('pipe-on-plate')
    expect(histogram(seams, outcome)).toEqual({ standard: 1, blocked: 1 })
    for (const seam of seams) {
      const radius = Math.hypot(mid(seam)[0], mid(seam)[1])
      const { access } = outcome.results[seam.id]!
      if (Math.abs(radius - 25) < 1) expect(access).toMatchObject({ class: 'standard', clearanceDeg: 45, nearClearanceDeg: 45 })
      else {
        expect(Math.abs(radius - 19)).toBeLessThan(1)
        expect(access.class).toBe('blocked')
        expect(access.unreachable).toHaveLength(1)
      }
    }
  })

  it('l-bracket-gussets: 8 slim and 8 blocked, none standard', async () => {
    const { seams, outcome } = await analyse('l-bracket-gussets')
    expect(histogram(seams, outcome)).toEqual({ slim: 8, blocked: 8 })
  })

  it('double-bottom-cell: 28 snake and 28 blocked; floor-facing long seams are buried under the floors', async () => {
    const { seams, outcome } = await analyse('double-bottom-cell')
    expect(seams).toHaveLength(56)
    expect(histogram(seams, outcome)).toEqual({ snake: 28, blocked: 28 })

    const long = seams.filter((s) => s.lengthMm > 700)
    expect(long).toHaveLength(8)
    for (const seam of long) {
      const y = mid(seam)[1]
      const { access } = outcome.results[seam.id]!
      const outer = Math.abs(y - 165) < 1 || Math.abs(y - 335) < 1
      if (outer) expect(access).toMatchObject({ class: 'snake', unreachable: [] })
      else {
        expect(access.class).toBe('blocked')
        for (const x of [200, 400, 600]) expect(access.unreachable.some(([a, b]) => a <= x && x <= b)).toBe(true)
      }
    }
  })

  it('double-bottom-cell: 56 seams are analysed in under 3 s with progress', async () => {
    const events: Array<[string, number]> = []
    const { outcome } = await analyse('double-bottom-cell', (stage, fraction) => void events.push([stage, fraction]))
    expect(outcome.ms).toBeLessThan(3000)
    expect(events.length).toBeGreaterThanOrEqual(2)
    expect(events.every(([stage]) => stage === 'access')).toBe(true)
    expect(events[events.length - 1]![1]).toBe(1)
    expect(Object.keys(outcome.results)).toHaveLength(56)
  })

  it('tank-with-manhole: 20 snake inside seams and the coaming loop standard, by group', async () => {
    const t0 = performance.now()
    const { seams, outcome } = await analyse('tank-with-manhole')
    expect(seams).toHaveLength(21)
    expect(histogram(seams, outcome)).toEqual({ snake: 20, standard: 1 })

    const groups: Record<string, number> = {}
    const near = (a: number, b: number) => Math.abs(a - b) < 2
    for (const seam of seams) {
      const { access } = outcome.results[seam.id]!
      expect(access.unreachable, seam.label).toEqual([])
      const [x, , z] = mid(seam)
      const longitudinal = near(seam.lengthMm, 272)
      const transverse = near(seam.lengthMm, 864)
      let group: string
      let far = 0
      let nearDeg = 10
      if (access.class === 'standard') {
        group = 'coaming'
        far = 45
        nearDeg = 45
      } else if (longitudinal) {
        group = 'longitudinal'
        far = 10
        nearDeg = 45
      } else if (transverse) {
        // faces at x 746 and 1154 look at the walls, faces at x 754 and 1146 look into the middle bay
        const outer = near(x, 746) || near(x, 1154)
        group = outer ? 'transverse-outer' : 'transverse-inner'
        far = outer ? 10 : 0
        nearDeg = outer ? 45 : 35
      } else {
        group = z < 500 ? 'floor-or-corner' : 'roof-or-corner'
      }
      groups[group] = (groups[group] ?? 0) + 1
      expect(access, `${seam.label} (${group})`).toMatchObject({ clearanceDeg: far, nearClearanceDeg: nearDeg })
    }
    expect(groups).toEqual({
      coaming: 1,
      longitudinal: 4,
      'transverse-outer': 2,
      'transverse-inner': 2,
      'floor-or-corner': expect.any(Number),
      'roof-or-corner': expect.any(Number),
    })
    expect(performance.now() - t0).toBeLessThan(3000)
  })

  it('says what to do when there is no part', async () => {
    const outcome = await createGeometryApi().access([], () => {})
    expect(outcome.status).toBe('error')
    if (outcome.status === 'error') for (const part of [outcome.error.what, outcome.error.why, outcome.error.next]) expect(part.trim()).not.toBe('')
  })
})
