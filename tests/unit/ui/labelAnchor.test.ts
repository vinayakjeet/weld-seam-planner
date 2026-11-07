import { describe, expect, it } from 'vitest'
import { hiddenLabelsText, labelAnchor, labelLift } from '../../../src/ui/viewport/labelAnchor'

const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 6))

describe('labelAnchor', () => {
  it('lifts the label off the seam into the open side of the joint, between the two plate normals', () => {
    const point = { p: [100, 0, 10] as [number, number, number], n1: [0, 0, 1] as [number, number, number], n2: [0, -1, 0] as [number, number, number] }
    close(labelAnchor(point, 10), [100, -10 / Math.SQRT2, 10 + 10 / Math.SQRT2])
  })

  it('puts the two fillets of a T-joint on the two sides of the web, so their labels do not sit on one another', () => {
    const front = labelAnchor({ p: [0, -5, 10], n1: [0, 0, 1], n2: [0, -1, 0] }, 6)
    const back = labelAnchor({ p: [0, 5, 10], n1: [0, 0, 1], n2: [0, 1, 0] }, 6)
    expect(back[1] - front[1]).toBeGreaterThan(10 + 2 * 6 * 0.7)
  })

  it('lifts along the first normal when the plates face opposite ways', () => {
    close(labelAnchor({ p: [0, 0, 0], n1: [0, 0, 1], n2: [0, 0, -1] }, 5), [0, 0, 5])
  })
})

describe('labelLift', () => {
  it('is a small share of the part size, never less than 3 mm or more than 40 mm', () => {
    expect(labelLift({ min: [0, 0, 0], max: [200, 0, 0] })).toBe(3)
    expect(labelLift({ min: [0, 0, 0], max: [1000, 0, 0] })).toBeCloseTo(15, 6)
    expect(labelLift({ min: [0, 0, 0], max: [40000, 0, 0] })).toBe(40)
  })
})

describe('hiddenLabelsText', () => {
  it('says how many sequence labels the part hides and that x-ray shows them', () => {
    expect(hiddenLabelsText(0)).toBeNull()
    expect(hiddenLabelsText(1)).toBe('1 sequence label is behind the part. X-ray (X) shows it.')
    expect(hiddenLabelsText(54)).toBe('54 sequence labels are behind the part. X-ray (X) shows them.')
  })
})
