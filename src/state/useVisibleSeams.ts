import { useMemo } from 'react'
import type { SeamCandidate } from '../core/seams/detect'
import { visibleSeams } from './selectors'
import { useStore } from './store'

// The seams the user can see: everything detected, less the corner candidates while they are switched off.
export function useVisibleSeams(): SeamCandidate[] {
  const seams = useStore((s) => s.seams)
  const showCorners = useStore((s) => s.showCorners)
  return useMemo(() => visibleSeams(seams, showCorners), [seams, showCorners])
}
