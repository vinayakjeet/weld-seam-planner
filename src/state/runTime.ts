// How long a run took, for the messages after it. A very quick run would round to 0.0 s, which reads like nothing ran.
export function runTimeText(ms: number): string {
  return ms < 100 ? 'under 0.1 s' : `${(ms / 1000).toFixed(1)} s`
}
