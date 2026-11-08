import { describe, expect, it } from 'vitest'
import { buildMeshModel } from '../../../src/core/mesh/model'
import { DEFAULT_DETECT_SETTINGS, detectSeams, type SeamCandidate } from '../../../src/core/seams/detect'
import { shown } from '../helpers/state'
import { extrude, soupOf } from '../helpers/shapes'
import type { Tri } from '../helpers/stl'

const WIDTH = 25.4
const detect = (tris: Tri[]) => shown(detectSeams(buildMeshModel(soupOf(tris), 1), DEFAULT_DETECT_SETTINGS))
const creases = (seams: SeamCandidate[]) => seams.filter((s) => s.source === 'crease')
const prism = (profile: Array<[number, number]>, cap: Array<[number, number, number]>) => extrude(profile, cap, WIDTH, (u, v, w) => [u, v, w])

// A rail along x with a rung of the given width and length butting it, one solid, flat on top and bottom: the rung end
// has a crease on each side and none on top or below.
const tee = (rungWidth = WIDTH, rungLength = 200) => {
  const [a, b] = [150 - rungWidth / 2, 150 + rungWidth / 2]
  return prism(
    [[0, 0], [300, 0], [300, WIDTH], [b, WIDTH], [b, WIDTH + rungLength], [a, WIDTH + rungLength], [a, WIDTH], [0, WIDTH]],
    [[0, 1, 3], [1, 2, 3], [0, 3, 6], [0, 6, 7], [3, 4, 5], [3, 5, 6]],
  )
}

describe('weld all around a member end inside one body', () => {
  it('closes the two creases of a tube end flush with the tube it meets into one fillet of 4 x 25.4 mm, at 0.8 or more', () => {
    const seams = detect(tee())
    expect(seams.map((s) => [s.source, s.jointType, s.closed])).toEqual([['crease', 'fillet', true]])
    expect(seams[0]!.lengthMm).toBeCloseTo(4 * WIDTH, 2)
    expect(seams[0]!.openingAngleDeg).toBeCloseTo(90, 1)
    expect(seams[0]!.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('keeps the four corners on the seam, in the plane where the rung meets the rail', () => {
    const [seam] = detect(tee())
    for (const [x, z] of [[137.3, 0], [162.7, 0], [162.7, WIDTH], [137.3, WIDTH]]) {
      const nearest = Math.min(...seam!.points.map(({ p }) => Math.hypot(p[0] - x!, p[1] - WIDTH, p[2] - z!)))
      expect(nearest, `${x} ${z}`).toBeLessThan(1e-3)
    }
  })

  it('reads the flush sides with the face on top and the face of the rail as their plates', () => {
    const [seam] = detect(tee())
    const top = seam!.points.find(({ p }) => Math.abs(p[0] - 150) < 2 && Math.abs(p[2] - WIDTH) < 1e-6)!
    expect([top.n1, top.n2].map((n) => n.map((x) => Math.round(x)).join()).sort()).toEqual(['0,0,1', '0,1,0'])
  })

  it('closes a tube end flush with the end of the tube it meets, which has one crease', () => {
    const corner = prism(
      [[0, 0], [200, 0], [200, WIDTH], [WIDTH, WIDTH], [WIDTH, 200], [0, 200]],
      [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 5]],
    )
    const seams = detect(corner)
    expect(seams.map((s) => [s.source, s.closed])).toEqual([['crease', true]])
    expect(seams[0]!.lengthMm).toBeCloseTo(4 * WIDTH, 2)
  })

  it('pairs the four creases of two tubes crossing into two loops, using each crease once', () => {
    const [a, b] = [150 - WIDTH / 2, 150 + WIDTH / 2]
    const cross = prism(
      [[a, 0], [b, 0], [b, a], [300, a], [300, b], [b, b], [b, 300], [a, 300], [a, b], [0, b], [0, a], [a, a]],
      [[0, 1, 2], [0, 2, 11], [11, 2, 5], [11, 5, 8], [2, 3, 4], [2, 4, 5], [5, 6, 7], [5, 7, 8], [8, 9, 10], [8, 10, 11]],
    )
    const seams = detect(cross)
    expect(seams).toHaveLength(2)
    for (const seam of seams) {
      expect(seam.closed).toBe(true)
      expect(seam.lengthMm).toBeCloseTo(4 * WIDTH, 2)
    }
  })

  it('leaves the creases open when the rung is a short stub that hardly runs away from the rail', () => {
    const seams = creases(detect(tee(WIDTH, 10)))
    expect(seams.map((s) => s.closed)).toEqual([false, false])
  })

  it('leaves the creases of a wide web open: its foot is not the end of a compact member', () => {
    const seams = creases(detect(tee(150)))
    expect(seams.map((s) => s.closed)).toEqual([false, false])
  })

  it('closes the end of a tube meeting another at an angle, with the crease ends exact and the mean opening 90 degrees', () => {
    // A rail along x and a tube leaving it 58 degrees off the rail, its section cut square by the rail's face.
    const across = WIDTH / Math.sin((58 * Math.PI) / 180)
    const run = 150 * Math.cos((58 * Math.PI) / 180)
    const rise = 150 * Math.sin((58 * Math.PI) / 180)
    const angled = prism(
      [[0, 0], [300, 0], [300, WIDTH], [100 + across, WIDTH], [100 + across + run, WIDTH + rise], [100 + run, WIDTH + rise], [100, WIDTH], [0, WIDTH]],
      [[0, 1, 3], [1, 2, 3], [0, 3, 6], [0, 6, 7], [3, 4, 5], [3, 5, 6]],
    )
    const seams = detect(angled)
    expect(seams.map((s) => [s.source, s.closed])).toEqual([['crease', true]])
    const [seam] = seams
    expect(seam!.lengthMm).toBeCloseTo(2 * (WIDTH + across), 2)
    expect(seam!.openingAngleDeg).toBeCloseTo(90, 1)
    expect(seam!.confidence).toBeGreaterThanOrEqual(0.8)
    for (const x of [100, 100 + across]) {
      const nearest = Math.min(...seam!.points.map(({ p }) => Math.hypot(p[0] - x, p[1] - WIDTH, p[2])))
      expect(nearest, String(x)).toBeLessThan(1e-3)
    }
  })

  it('closes an angled tube end whose wide side lands near the edge of the rail', () => {
    const across = WIDTH / Math.sin((58 * Math.PI) / 180)
    const run = 150 * Math.cos((58 * Math.PI) / 180)
    const rise = 150 * Math.sin((58 * Math.PI) / 180)
    const nearEnd = prism(
      [[91, 0], [300, 0], [300, WIDTH], [100 + across, WIDTH], [100 + across - run, WIDTH + rise], [100 - run, WIDTH + rise], [100, WIDTH], [91, WIDTH]],
      [[0, 1, 3], [1, 2, 3], [0, 3, 6], [0, 6, 7], [3, 4, 5], [3, 5, 6]],
    )
    expect(detect(nearEnd).map((s) => [s.source, s.closed])).toEqual([['crease', true]])
  })

  // A tilted tube end on the go-kart frame touches the rail over part of its width and leaves a sliver up to 0.05 mm.
  it('closes a tube end that a sliver gap parts from the rail along one side', () => {
    const tilt = 0.05
    const tilted = prism(
      [[0, 0], [300, 0], [300, WIDTH], [162.7, WIDTH], [162.7, WIDTH + 200], [137.3, WIDTH + 200], [137.3, WIDTH + tilt], [150, WIDTH], [0, WIDTH]],
      [[0, 1, 3], [1, 2, 3], [0, 3, 7], [0, 7, 8], [3, 4, 5], [3, 5, 6], [3, 6, 7]],
    )
    const closed = detect(tilted).filter((s) => s.closed && s.source === 'crease')
    expect(closed).toHaveLength(1)
    expect(closed[0]!.openingAngleDeg).toBeCloseTo(90, 0)
  })

  // Under the end of the upper plate of a stepped lap is the end of the lower one: only as tall as that plate is thick.
  it('leaves the creases of a stepped lap open: the end of a plate is no surface for a member to stand on', () => {
    const lap = prism([[0, 0], [300, 0], [300, 6], [500, 6], [500, 26], [200, 26], [200, 6], [0, 6]], [[0, 1, 6], [0, 6, 7], [1, 2, 6], [2, 5, 6], [2, 3, 5], [3, 4, 5]])
    expect(creases(detect(lap)).map((s) => s.closed)).toEqual([false, false])
  })

  // The bar below the step runs on past the crease, so it has no end there.
  it('leaves a lone crease open when the member it would close runs on past it', () => {
    const step = prism([[0, 0], [300, 0], [300, 50], [150, 50], [150, WIDTH], [0, WIDTH]], [[0, 1, 4], [1, 2, 4], [2, 3, 4], [0, 4, 5]])
    const seams = creases(detect(step))
    expect(seams.map((s) => s.closed)).toEqual([false])
  })
})
