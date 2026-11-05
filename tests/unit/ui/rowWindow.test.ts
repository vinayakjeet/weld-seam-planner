import { describe, expect, it } from 'vitest'
import { revealScrollTop, rowWindow } from '../../../src/ui/panels/rowWindow'

const H = 28

describe('rowWindow', () => {
  it('renders every row of a short list, so nothing changes for the plans people have today', () => {
    expect(rowWindow({ count: 56, scrollTop: 400, viewportHeight: 300, rowHeight: H })).toEqual({ start: 0, end: 56, before: 0, after: 0, windowed: false })
    expect(rowWindow({ count: 0, scrollTop: 0, viewportHeight: 300, rowHeight: H }).windowed).toBe(false)
  })

  it('renders the rows in view plus the overscan, with spacers for the rest, once the list is long', () => {
    const w = rowWindow({ count: 1000, scrollTop: 2800, viewportHeight: 280, rowHeight: H, overscan: 5, minRows: 100 })
    // rows 100 to 109 are in view
    expect(w.start).toBe(95)
    expect(w.end).toBe(115)
    expect(w.before).toBe(95 * H)
    expect(w.after).toBe(885 * H)
    expect(w.windowed).toBe(true)
    expect(w.before + (w.end - w.start) * H + w.after).toBe(1000 * H)
  })

  it('starts at row 0 at the top and ends at the last row at the bottom', () => {
    const top = rowWindow({ count: 1000, scrollTop: 0, viewportHeight: 280, rowHeight: H, overscan: 5, minRows: 100 })
    expect(top.start).toBe(0)
    expect(top.before).toBe(0)
    const bottom = rowWindow({ count: 1000, scrollTop: 1000 * H - 280, viewportHeight: 280, rowHeight: H, overscan: 5, minRows: 100 })
    expect(bottom.end).toBe(1000)
    expect(bottom.after).toBe(0)
  })

  it('clamps a scroll position that is past the end, as after a filter shortens the list', () => {
    const w = rowWindow({ count: 150, scrollTop: 99999, viewportHeight: 280, rowHeight: H, overscan: 5, minRows: 100 })
    expect(w.end).toBe(150)
    expect(w.start).toBeLessThan(150)
    expect(w.start).toBeGreaterThanOrEqual(0)
    expect(rowWindow({ count: 150, scrollTop: -50, viewportHeight: 280, rowHeight: H, overscan: 5, minRows: 100 }).start).toBe(0)
  })

  it('still draws a window before the height of the box is known', () => {
    const w = rowWindow({ count: 1000, scrollTop: 0, viewportHeight: 0, rowHeight: H, overscan: 5, minRows: 100 })
    expect(w.end - w.start).toBeGreaterThan(10)
    expect(w.end - w.start).toBeLessThan(100)
  })

  it('keeps the window small whatever the length of the list', () => {
    for (const count of [200, 5000, 100000]) {
      const w = rowWindow({ count, scrollTop: (count / 2) * H, viewportHeight: 600, rowHeight: H })
      expect(w.end - w.start).toBeLessThan(60)
    }
  })
})

describe('revealScrollTop', () => {
  it('needs no scroll for a row that is fully in view', () => {
    expect(revealScrollTop({ index: 12, scrollTop: 280, viewportHeight: 280, rowHeight: H })).toBeNull()
    expect(revealScrollTop({ index: 10, scrollTop: 280, viewportHeight: 280, rowHeight: H })).toBeNull()
    expect(revealScrollTop({ index: 19, scrollTop: 280, viewportHeight: 280, rowHeight: H })).toBeNull()
  })

  it('scrolls up so that a row above the view is at the top', () => {
    expect(revealScrollTop({ index: 3, scrollTop: 280, viewportHeight: 280, rowHeight: H })).toBe(3 * H)
  })

  it('scrolls down so that a row below the view is at the bottom', () => {
    expect(revealScrollTop({ index: 40, scrollTop: 280, viewportHeight: 280, rowHeight: H })).toBe(41 * H - 280)
  })

  it('moves a row that is cut off at the bottom edge fully into view', () => {
    expect(revealScrollTop({ index: 20, scrollTop: 280, viewportHeight: 280 + 10, rowHeight: H })).toBe(21 * H - 290)
  })
})
