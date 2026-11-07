import type { AccessClass } from '../../core/access/clearance'
import type { SeamReach } from '../../core/snake/reach'
import { accessLabel } from './accessText'

// A whole percent that is never 100 unless everything is reached and never 0 when something is.
export function coverageText(coverage: number): string {
  const pct = coverage >= 1 ? 100 : Math.max(coverage > 0 ? 1 : 0, Math.floor(coverage * 100))
  return `${pct} %`
}

// What the arm managed on a snake seam; empty for the other classes, which the arm does not serve.
export function reachLine(reach: SeamReach | null, cls: AccessClass | null): string {
  if (cls !== 'snake') return ''
  if (reach === null) return 'Reach not run'
  if (reach.coverage <= 0 || reach.portId === null) return 'Not reached from any port'
  return `${coverageText(reach.coverage)} reached from ${reach.portId}`
}

// The Acc cell tooltip: the class, then the reach line in lower case after a comma.
export function accessTitle(cls: AccessClass | null, reach: SeamReach | null): string {
  if (cls === null) return ''
  const line = reachLine(reach, cls)
  return line === '' ? accessLabel(cls) : `${accessLabel(cls)}, ${line.charAt(0).toLowerCase()}${line.slice(1)}`
}

// One line over the seams measured under the current ports and arm, for comparing runs.
export function reachSummary(coverages: number[]): string {
  if (coverages.length === 0) return ''
  const full = coverages.filter((c) => c >= 1).length
  const mean = coverages.reduce((total, c) => total + c, 0) / coverages.length
  return `${coverages.length} snake ${coverages.length === 1 ? 'seam' : 'seams'} measured: ${full} fully reached, mean coverage ${coverageText(mean)}.`
}

// Under the reach results: what the seam colours mean (--reach-ok and --reach-miss) and how to see the arm.
export const REACH_LEGEND = 'Seams are coloured green where the arm reaches them and red where it does not. Select a seam and move the scrub to see the arm.'

// Under Run reach when some results were measured with the old ports or arm, above the button that updates them; empty
// when none was.
export function staleReachText(count: number): string {
  if (count === 0) return ''
  return count === 1
    ? '1 seam still has a result from the old ports or arm.'
    : `${count} seams still have results from the old ports or arm.`
}
