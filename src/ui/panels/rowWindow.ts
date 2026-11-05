// Windowing for a table of rows of one fixed height: only the rows in view are drawn, with spacers for the rest.

// Rows are 28 px (h-7) in the seam table.
export const ROW_HEIGHT = 28
// Below this many rows every row is drawn: the table is cheap and keeps its plain structure.
export const WINDOW_MIN_ROWS = 120
export const OVERSCAN_ROWS = 8
// Used until the box has been measured.
const UNMEASURED_HEIGHT = 800

export interface RowWindow {
  // Rows start to end (end exclusive) are drawn.
  start: number
  end: number
  // Heights of the spacers above and below the drawn rows, so the scroll bar stands for the whole list.
  before: number
  after: number
  windowed: boolean
}

export function rowWindow(input: {
  count: number
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  overscan?: number
  minRows?: number
}): RowWindow {
  const { count, rowHeight, overscan = OVERSCAN_ROWS, minRows = WINDOW_MIN_ROWS } = input
  if (count <= minRows) return { start: 0, end: count, before: 0, after: 0, windowed: false }
  const height = input.viewportHeight > 0 ? input.viewportHeight : UNMEASURED_HEIGHT
  const scrollTop = Math.min(Math.max(input.scrollTop, 0), Math.max(count * rowHeight - height, 0))
  const first = Math.floor(scrollTop / rowHeight)
  const last = Math.ceil((scrollTop + height) / rowHeight)
  const start = Math.min(Math.max(first - overscan, 0), count)
  const end = Math.min(Math.max(last + overscan, start), count)
  return { start, end, before: start * rowHeight, after: (count - end) * rowHeight, windowed: true }
}

// The scroll position that brings a row fully into view with the least movement, or null when it already is.
export function revealScrollTop(input: { index: number; scrollTop: number; viewportHeight: number; rowHeight: number }): number | null {
  const { index, scrollTop, viewportHeight, rowHeight } = input
  const top = index * rowHeight
  const bottom = top + rowHeight
  if (top < scrollTop) return top
  if (bottom > scrollTop + viewportHeight) return bottom - viewportHeight
  return null
}

export type WindowPart = { gap: number } | { start: number; end: number }

// The rows to draw and the spacers between them, top to bottom. Rows in keep stay drawn in their place even out of the
// window: a dragged row has to exist until the drag ends, and a row moved by key has to exist to take the focus.
export function windowParts(window: RowWindow, keep: readonly number[], count: number, rowHeight: number): WindowPart[] {
  if (!window.windowed) return [{ start: window.start, end: window.end }]
  const ranges: Array<[number, number]> = [[window.start, window.end]]
  for (const k of keep) if (Number.isInteger(k) && k >= 0 && k < count) ranges.push([k, k + 1])
  ranges.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const [a, b] of ranges) {
    const last = merged[merged.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else merged.push([a, b])
  }
  const parts: WindowPart[] = []
  let at = 0
  for (const [start, end] of merged) {
    if (start > at) parts.push({ gap: (start - at) * rowHeight })
    if (end > start) parts.push({ start, end })
    at = end
  }
  if (count > at) parts.push({ gap: (count - at) * rowHeight })
  return parts
}
