import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import { poseAtTime } from '../../core/sequence/playback'
import { useStore } from '../../state/store'
import { TorchMesh } from './TorchMesh'

// Longest step the clock takes in one frame, so a stalled tab does not jump the torch across the plan on return.
const MAX_FRAME_S = 0.1

// The torch at the playback time, in the Sequence and Export steps. It also runs the clock: the canvas only draws on
// demand, so while playing every frame asks for the next one, and it stops asking when playback stops.
export function PlaybackTorch() {
  const active = useStore((s) => s.activeStep === 'sequence' || s.activeStep === 'export')
  const data = useStore((s) => s.playback)
  const timeS = useStore((s) => s.timeS)

  useFrame((state, delta) => {
    const { playing, tick } = useStore.getState()
    if (!playing) return
    tick(Math.min(delta, MAX_FRAME_S))
    state.invalidate()
  })

  const ctwdBySeam = useMemo(() => new Map(data?.path.seams.map((s) => [s.seamId, s.ctwdMm]) ?? []), [data])
  const at = useMemo(() => (active && data ? poseAtTime(data.path, data.timing, timeS) : null), [active, data, timeS])
  const pose = useMemo(() => (at ? { p: at.position, q: at.quaternion } : null), [at])
  if (!pose || !at) return null
  // The air move to a seam already shows that seam's torch; the move home has no seam.
  return <TorchMesh pose={pose} name="playback-torch" ctwdMm={ctwdBySeam.get(at.seamId) ?? null} />
}
