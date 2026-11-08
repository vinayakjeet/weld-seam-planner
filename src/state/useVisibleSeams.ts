import { useMemo } from 'react'
import type { SeamCandidate } from '../core/seams/detect'
import { selectAllSeams, visibleSeams } from './selectors'
import { useStore } from './store'

// The seams the user can see: detected and manual, less the hidden ones that are not accepted while their kind is off.
// The selected seams that are visible, in table order.
export function useSelectedSeams(): SeamCandidate[] {
  const visible = useVisibleSeams()
  const selectedIds = useStore((s) => s.selectedIds)
  return useMemo(() => visible.filter((seam) => selectedIds.includes(seam.id)), [visible, selectedIds])
}

export function useVisibleSeams(): SeamCandidate[] {
  const seams = useStore((s) => s.seams)
  const manualSeams = useStore((s) => s.manualSeams)
  const supersededIds = useStore((s) => s.supersededIds)
  const showCorners = useStore((s) => s.showCorners)
  const showHollow = useStore((s) => s.showHollow)
  const statusById = useStore((s) => s.statusById)
  return useMemo(
    () => visibleSeams(selectAllSeams({ seams, manualSeams, supersededIds }), { showCorners, showHollow }, statusById),
    [seams, manualSeams, supersededIds, showCorners, showHollow, statusById],
  )
}
