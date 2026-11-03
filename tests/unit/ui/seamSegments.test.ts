import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../../../src/core/math/vec3'
import type { SeamCandidate } from '../../../src/core/seams/detect'
import { buildSeamSegments, polylineSegmentPositions, seamSegmentPositions, type SeamPalette } from '../../../src/ui/viewport/seamSegments'
import { seam } from '../helpers/state'

const palette: SeamPalette = {
  candidate: [0.1, 0.1, 0.1],
  accepted: [0.2, 0.4, 0.9],
  rejected: [0.9, 0.2, 0.2],
  access: { standard: [0, 1, 0], slim: [0, 1, 1], snake: [1, 1, 0], blocked: [1, 0, 0] },
}

function seamOn(id: string, points: Vec3[], closed = false): SeamCandidate {
  const up: Vec3 = [0, 0, 1]
  return { ...seam(id), closed, points: points.map((p, i) => ({ s: i, p, t: up, n1: up, n2: up })) }
}

const A: Vec3 = [0, 0, 0]
const B: Vec3 = [10, 0, 0]
const C: Vec3 = [10, 10, 0]
const D: Vec3 = [0, 10, 0]

describe('seamSegmentPositions', () => {
  it('gives one segment per gap between points for an open seam', () => {
    expect(Array.from(seamSegmentPositions(seamOn('a', [A, B, C])))).toEqual([...A, ...B, ...B, ...C])
  })

  it('adds a closing segment from the last point back to the first for a closed seam', () => {
    const positions = seamSegmentPositions(seamOn('a', [A, B, C, D], true))
    expect(positions).toHaveLength(4 * 6)
    expect(Array.from(positions.slice(18))).toEqual([...D, ...A])
  })

  it('gives nothing for a seam with fewer than two points', () => {
    expect(seamSegmentPositions(seamOn('a', [A]))).toHaveLength(0)
    expect(seamSegmentPositions(seamOn('a', []))).toHaveLength(0)
  })
})

describe('buildSeamSegments', () => {
  it('is empty without seams', () => {
    const built = buildSeamSegments([], {}, palette)
    expect(built.positions).toHaveLength(0)
    expect(built.colors).toHaveLength(0)
    expect(built.segmentSeam).toHaveLength(0)
  })

  it('maps every segment back to the index of its seam, for open and closed seams', () => {
    const seams = [seamOn('open', [A, B, C]), seamOn('ring', [A, B, C, D], true), seamOn('short', [A, B])]
    const built = buildSeamSegments(seams, {}, palette)
    expect(Array.from(built.segmentSeam)).toEqual([0, 0, 1, 1, 1, 1, 2])
    expect(built.positions).toHaveLength(7 * 6)
    expect(built.colors).toHaveLength(7 * 6)
  })

  it('keeps seams in input order, so segments of one seam stay together', () => {
    const built = buildSeamSegments([seamOn('a', [A, B]), seamOn('b', [C, D])], {}, palette)
    expect(Array.from(built.positions.slice(0, 6))).toEqual([...A, ...B])
    expect(Array.from(built.positions.slice(6, 12))).toEqual([...C, ...D])
  })

  it('colours each seam by its status, with an absent status meaning candidate', () => {
    const seams = [seamOn('c', [A, B]), seamOn('a', [A, B]), seamOn('r', [A, B])]
    const built = buildSeamSegments(seams, { a: 'accepted', r: 'rejected' }, palette)
    const colourOf = (segment: number) => Array.from(built.colors.slice(segment * 6, segment * 6 + 6)).map((v) => Math.round(v * 10) / 10)
    expect(colourOf(0)).toEqual([...palette.candidate, ...palette.candidate])
    expect(colourOf(1)).toEqual([...palette.accepted, ...palette.accepted])
    expect(colourOf(2)).toEqual([...palette.rejected, ...palette.rejected])
  })

  it('ignores a status whose seam is not in the list', () => {
    const built = buildSeamSegments([seamOn('a', [A, B])], { gone: 'accepted' }, palette)
    expect(built.segmentSeam).toHaveLength(1)
  })
})

describe('polylineSegmentPositions', () => {
  it('lays an open polyline out as consecutive segments of 6 floats', () => {
    const out = polylineSegmentPositions([[0, 0, 0], [10, 0, 0], [10, 5, 0]])
    expect(Array.from(out)).toEqual([0, 0, 0, 10, 0, 0, 10, 0, 0, 10, 5, 0])
  })

  it('has nothing to draw for fewer than two points', () => {
    expect(polylineSegmentPositions([]).length).toBe(0)
    expect(polylineSegmentPositions([[1, 2, 3]]).length).toBe(0)
  })
})

describe('buildSeamSegments coloured by access', () => {
  const seams = [seamOn('a', [A, B]), seamOn('b', [B, C]), seamOn('c', [C, D])]

  it('colours a seam with an access class in the colour of the class, and the rest by status', () => {
    const classes: Record<string, 'standard' | 'blocked'> = { a: 'standard', b: 'blocked' }
    const built = buildSeamSegments(seams, { a: 'accepted', b: 'accepted', c: 'accepted' }, palette, (s) => classes[s.id] ?? null)
    expect(Array.from(built.colors.slice(0, 3))).toEqual([0, 1, 0])
    expect(Array.from(built.colors.slice(6, 9))).toEqual([1, 0, 0])
    expect(Array.from(built.colors.slice(12, 15))).toEqual(Array.from(new Float32Array(palette.accepted)))
  })

  it('colours by status when no access function is given', () => {
    const built = buildSeamSegments(seams, { a: 'accepted' }, palette)
    expect(Array.from(built.colors.slice(0, 3))).toEqual(Array.from(new Float32Array(palette.accepted)))
  })
})
