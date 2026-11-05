import { useEffect } from 'react'
import { startInsertionClock } from '../../state/insertionClock'

// Runs the insertion playback clock for as long as the app is mounted.
export function useInsertionClock(): void {
  useEffect(() => startInsertionClock(), [])
}
