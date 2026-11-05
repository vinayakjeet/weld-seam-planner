import type { Explained } from '../../core/job/plan'

const NOT_A_NUMBER = (label: string, unit: string): Explained => ({
  what: `The torch cleaning ${label} was not changed because the text is not a number.`,
  why: 'The field takes a plain number such as 30 or 7.5.',
  next: `Type the ${unit} as a number, then press Enter.`,
})

function number(text: string): number | null {
  const trimmed = text.trim().replace(',', '.')
  const value = Number(trimmed)
  return trimmed !== '' && Number.isFinite(value) ? value : null
}

// The text box takes minutes of arc time between cleanings; the plan keeps seconds.
export function parseCleaningEvery(text: string): { seconds: number } | { error: Explained } {
  const value = number(text)
  return value === null ? { error: NOT_A_NUMBER('interval', 'minutes of arc time between cleanings, or 0 for none') } : { seconds: value * 60 }
}

export function parseCleaningTime(text: string): { seconds: number } | { error: Explained } {
  const value = number(text)
  return value === null ? { error: NOT_A_NUMBER('time', 'seconds one cleaning stop takes') } : { seconds: value }
}

export function cleaningEveryText(seconds: number): string {
  return String(Number((seconds / 60).toFixed(2)))
}
