// Measures the numbers README.md quotes under Key numbers. Run with npx tsx scripts/key-numbers.ts; it takes about a
// minute, most of it the tank reach.
import { planTiming } from '../src/core/job/timing'
import type { Plan } from '../src/core/job/plan'
import { DEFAULT_ARM } from '../src/core/snake/arm'
import { DEFAULT_DETECT_SETTINGS } from '../src/core/seams/detect'
import { createGeometryApi, type SeamCandidate } from '../src/worker/geometry.api'
import { samplePlan } from '../tests/unit/helpers/jobs'
import { readManifest, readSample } from '../tests/unit/helpers/samples'
import { slicedTJoint } from '../tests/unit/helpers/shapes'
import { P1 } from '../tests/unit/helpers/snake'
import { shown } from '../tests/unit/helpers/state'
import { makeBinaryStl } from '../tests/unit/helpers/stl'

const quiet = () => {}

async function loaded(id: string) {
  const api = createGeometryApi()
  const entry = readManifest().samples.find((s) => s.id === id)!
  const outcome = await api.loadStl(readSample(id), `${id}.stl`, quiet)
  if (outcome.status === 'needs-units') await api.setUnits(entry.units, quiet)
  const detected = await api.detect(DEFAULT_DETECT_SETTINGS, quiet)
  if (detected.status !== 'ok') throw new Error(`detection failed on ${id}`)
  return { api, seams: shown(detected.seams) }
}

async function parseAndDetect(triangles: number) {
  const stl = makeBinaryStl(slicedTJoint(Math.round((triangles - 12) / 16)))
  const api = createGeometryApi()
  const started = performance.now()
  const outcome = await api.loadStl(stl, 'large.stl', quiet)
  if (outcome.status !== 'ready') throw new Error('the large part did not load')
  const detected = await api.detect(DEFAULT_DETECT_SETTINGS, quiet)
  if (detected.status !== 'ok') throw new Error('detection failed on the large part')
  return { triangles: outcome.part.triangles, s: (performance.now() - started) / 1000 }
}

async function accessTime(id: string) {
  const { api, seams } = await loaded(id)
  const outcome = await api.access(seams, quiet)
  if (outcome.status !== 'ok') throw new Error(`access failed on ${id}`)
  return { seams: seams.length, s: outcome.ms / 1000 }
}

async function airCut(id: string) {
  const plan: Plan = samplePlan(id)
  const table = plan.seams.map((p) => ({ seamId: p.seam.id, reversed: false }))
  const air = (order: typeof table) => planTiming({ ...plan, sequence: { strategy: 'manual', order } }).moves.reduce((t, m) => t + m.lengthMm, 0)
  const outcome = await createGeometryApi().optimiseSequence(plan, 'min-air-move', [], table, quiet)
  if (outcome.status !== 'ok') throw new Error(`sequencing failed on ${id}`)
  return { tableMm: air(table), bestMm: air(outcome.order), cut: 1 - air(outcome.order) / air(table) }
}

const atX746 = (seams: SeamCandidate[]) => seams.find((s) => Math.abs(s.points[s.points.length >> 1]!.p[0] - 746) < 2 && Math.abs(s.lengthMm - 864) < 3)

async function tankCoverage(bends: number[]) {
  const { api, seams } = await loaded('tank-with-manhole')
  const seam = atX746(seams)
  if (!seam) throw new Error('the seam at x 746 was not found on the tank')
  const out: Record<number, number> = {}
  for (const maxBendDeg of bends) {
    const outcome = await api.reach([seam], [P1], { ...DEFAULT_ARM, maxBendDeg }, quiet)
    if (outcome.status !== 'ok') throw new Error(`reach failed at ${maxBendDeg} deg`)
    out[maxBendDeg] = outcome.results[seam.id]!.coverage
  }
  return out
}

const large = await parseAndDetect(1_000_000)
console.log(`parse plus detect, ${large.triangles} triangles: ${large.s.toFixed(2)} s`)
const access = await accessTime('double-bottom-cell')
console.log(`access, double-bottom-cell, ${access.seams} seams: ${access.s.toFixed(3)} s`)
const air = await airCut('double-bottom-cell')
console.log(`air travel, double-bottom-cell: table ${air.tableMm.toFixed(0)} mm, minimum air travel ${air.bestMm.toFixed(0)} mm, cut ${(air.cut * 100).toFixed(1)} percent`)
const coverage = await tankCoverage([18, 25])
console.log(`tank seam at x 746, reach coverage: ${coverage[18]!.toFixed(3)} at 18 deg, ${coverage[25]!.toFixed(3)} at 25 deg`)
