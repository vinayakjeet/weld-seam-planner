import { useEffect } from 'react'
import { startTimingSync } from '../../state/timingSync'
import { getGeometryClient } from '../../worker/client'

// Keeps the cycle time current for as long as the app is open.
export function useTimingSync(): void {
  useEffect(() => startTimingSync(getGeometryClient()), [])
}
