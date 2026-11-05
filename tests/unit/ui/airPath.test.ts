import { describe, expect, it } from 'vitest'
import type { Vec3 } from '../../../src/core/math/vec3'
import type { PlaybackPath } from '../../../src/core/sequence/playback'
import { airPolylines, airSegmentPositions } from '../../../src/ui/viewport/airPath'

const seam = (id: string, from: Vec3, to: Vec3, approach: Vec3, retract: Vec3) => ({
  seamId: id,
  poses: [
    { s: 0, position: from, quaternion: [0, 0, 0, 1] as [number, number, number, number] },
    { s: 10, position: to, quaternion: [0, 0, 0, 1] as [number, number, number, number] },
  ],
  approach,
  retract,
  ctwdMm: 15,
})

const path: PlaybackPath = {
  home: [0, 0, 100],
  seams: [seam('a', [0, 0, 0], [10, 0, 0], [0, 0, 30], [10, 0, 30]), seam('b', [50, 0, 0], [60, 0, 0], [50, 0, 30], [60, 0, 30])],
}

describe('airPolylines', () => {
  it('runs each air move through the retract and approach points, as the torch flies it', () => {
    expect(airPolylines(path)).toEqual([
      [[0, 0, 100], [0, 0, 30], [0, 0, 0]],
      [[10, 0, 0], [10, 0, 30], [50, 0, 30], [50, 0, 0]],
      [[60, 0, 0], [60, 0, 30], [0, 0, 100]],
    ])
  })

  it('has seams + 1 moves, and none for an empty path', () => {
    expect(airPolylines(path)).toHaveLength(3)
    expect(airPolylines({ home: [0, 0, 0], seams: [] })).toEqual([])
  })

  it('goes straight from home to the first pose with a single seam, through its approach and retract', () => {
    const single: PlaybackPath = { home: [0, 0, 100], seams: [path.seams[0]!] }
    expect(airPolylines(single)).toEqual([
      [[0, 0, 100], [0, 0, 30], [0, 0, 0]],
      [[10, 0, 0], [10, 0, 30], [0, 0, 100]],
    ])
  })
})

describe('airSegmentPositions', () => {
  it('pairs the stops of every polyline into line segments, six numbers each', () => {
    const positions = airSegmentPositions(path)
    // 2 + 3 + 2 segments
    expect(positions).toHaveLength(7 * 6)
    expect(Array.from(positions.slice(0, 12))).toEqual([0, 0, 100, 0, 0, 30, 0, 0, 30, 0, 0, 0])
  })

  it('is empty for no seams', () => {
    expect(airSegmentPositions({ home: [0, 0, 0], seams: [] })).toHaveLength(0)
  })
})
