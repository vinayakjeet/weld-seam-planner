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

  const pose = useMemo(() => {
    if (!active || !data) return null
    const at = poseAtTime(data.path, data.timing, timeS)
    return { p: at.position, q: at.quaternion }
  }, [active, data, timeS])
  if (!pose) return null
  return <TorchMesh pose={pose} name="playback-torch" />
}
