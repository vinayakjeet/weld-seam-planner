import { useMemo } from 'react'
import { poseAt } from '../../core/torch/frames'
import { posesFor } from '../../state/torchSlice'
import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { TorchMesh } from './TorchMesh'

// The torch at the scrub position on the selected seam, in the pose the torch maths gives there. Nothing is drawn with no
// seam selected, while the poses are still being worked out, or when the pose is not one that can be drawn. The
// Sequence and Export steps have the playback torch instead.
export function TorchPreview() {
  const selectedId = useStore((s) => s.selectedId)
  const entry = useStore((s) => s.posesForSelected)
  const scrubS = useStore((s) => s.scrubS)
  const playbackStep = useStore((s) => s.activeStep === 'sequence' || s.activeStep === 'export')
  const seam = useVisibleSeams().find((s) => s.id === selectedId)

  const poses = seam ? posesFor({ posesForSelected: entry }, seam) : null
  const pose = useMemo(() => (seam && poses && poses.length > 0 ? poseAt(poses, scrubS, seam.closed) : null), [seam, poses, scrubS])
  if (!pose || playbackStep) return null
  return <TorchMesh pose={pose} name="torch-preview" />
}
