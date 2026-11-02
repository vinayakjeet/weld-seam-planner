import type { ManualError } from '../../core/seams/manual'
import type { ToolState } from '../tools/toolMachine'

export type NeedsSeam = 'split' | 'merge' | 'reverse' | 'delete' | 'trim'

const NOTHING_DONE: Record<NeedsSeam, string> = {
  split: 'Nothing was split.',
  merge: 'Nothing was merged.',
  reverse: 'Nothing was reversed.',
  delete: 'Nothing was deleted.',
  trim: 'Nothing was trimmed.',
}

export function needSeamSelected(action: NeedsSeam): ManualError {
  return {
    what: NOTHING_DONE[action],
    why: `To ${action} a seam, the app needs to know which one, and none is selected.`,
    next: 'Click a seam in the list or in the viewport, then try again.',
  }
}

export function fewPoints(count: number): ManualError {
  return {
    what: 'No seam was drawn.',
    why: `A seam needs at least two points and ${count === 1 ? 'only 1 has' : `${count} have`} been placed.`,
    next: 'Keep clicking along the joint, then press Enter or double click to finish.',
  }
}

export function missedSeam(): ManualError {
  return {
    what: 'The seam was not split.',
    why: 'The click was not close enough to the selected seam to pick a point on it.',
    next: 'Click on the highlighted seam, or press Esc and choose another seam first.',
  }
}

export function missedMergeTarget(fromLabel: string): ManualError {
  return {
    what: 'No seam was merged.',
    why: `The click was not on a seam, so there was nothing to join to seam ${fromLabel}.`,
    next: 'Click one of the highlighted seams, or press Esc to stop merging.',
  }
}

export function notATarget(clicked: string, from: string): ManualError {
  return {
    what: `Seam ${clicked} cannot be merged with seam ${from}.`,
    why: `Seam ${clicked} does not touch an end of seam ${from}. Only the highlighted seams are within 1 mm of it.`,
    next: 'Click a highlighted seam, or press Esc to stop merging.',
  }
}

export function badTrimInput(start: string, end: string): ManualError {
  const bad = [start, end].find((text) => text.trim() !== '' && !(Number(text) >= 0 && Number.isFinite(Number(text)))) ?? ''
  return {
    what: 'The seam was not trimmed.',
    why: `"${bad}" is not a length in millimetres. Trim needs a number of 0 or more in each box.`,
    next: 'Type how many millimetres to cut from each end, or leave a box empty for 0.',
  }
}

// Empty means no cut from that end. Anything that is not a finite number of 0 or more is refused, quoting what was typed.
export function parseTrimInput(start: string, end: string): { startMm: number; endMm: number } | ManualError {
  const read = (text: string) => (text.trim() === '' ? 0 : Number(text))
  const startMm = read(start)
  const endMm = read(end)
  const valid = (x: number) => Number.isFinite(x) && x >= 0
  return valid(startMm) && valid(endMm) ? { startMm, endMm } : badTrimInput(start, end)
}

// The line the status bar shows while a tool is armed; null leaves its normal note in place.
export function toolHint(state: ToolState): string | null {
  switch (state.tool) {
    case 'select':
      return null
    case 'draw': {
      const n = state.points.length
      const placed = n === 0 ? 'No points yet' : `${n} point${n === 1 ? '' : 's'} placed`
      return `Draw: ${placed}. Click along the joint, Enter or double click to finish, Backspace removes the last point, Esc cancels.`
    }
    case 'split':
      return 'Split: click the highlighted seam where it should be cut. Esc cancels.'
    case 'merge':
      return 'Merge: click a highlighted seam to join it to the seam you started from. Esc cancels.'
  }
}
