import type { WeldJob } from '../../core/job/schema'

const PART_FALLBACK = 'part'

function stem(partName: string, createdAt: string): string {
  const slug = partName
    .replace(/\.stl$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `weldjob-${slug === '' ? PART_FALLBACK : slug}-${createdAt.slice(0, 10)}`
}

// weldjob-<part>-<yyyy-mm-dd>.json, from the part's file name and the creation time of the job.
export function jobFilename(partName: string, createdAt: string): string {
  return `${stem(partName, createdAt)}.json`
}

export function rapidFilename(partName: string, createdAt: string): string {
  return `${stem(partName, createdAt)}.mod`
}

function minutesSeconds(totalS: number): string {
  const rounded = Math.round(totalS)
  return `${Math.floor(rounded / 60)} min ${rounded % 60} s`
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function summaryText(partName: string, summary: WeldJob['summary'], counts: { errors: number; warnings: number }): string {
  const metres = (summary.weldLengthMm / 1000).toFixed(2)
  return (
    `${partName}: ${count(summary.seamCount, 'seam')}, ${metres} m of weld, arc ${minutesSeconds(summary.arcTimeS)}, ` +
    `cycle ${minutesSeconds(summary.cycleTimeS)}, wire ${summary.wireKg.toFixed(2)} kg, gas ${Math.round(summary.gasL)} L. ` +
    `Pre-flight: ${count(counts.errors, 'error')}, ${count(counts.warnings, 'warning')}.`
  )
}
