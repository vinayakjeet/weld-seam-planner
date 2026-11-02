import { useMemo } from 'react'
import { Quaternion, Vector3 } from 'three'
import { poseAt } from '../../core/torch/frames'
import { posesFor } from '../../state/torchSlice'
import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { cssVar } from './cssVar'
import { placeTorch, type TorchPart } from './torchModel'

// The torch is drawn about this big for a part this size; other parts scale it, within limits.
const REFERENCE_DIAGONAL_MM = 300
const MIN_SCALE = 0.25
const MAX_SCALE = 6
const SEGMENTS = 24

// Cylinders run along Y; the tool axis is Z.
const Y_TO_Z = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2)

function Part({ part, orientation, color, metalness = 0.4 }: { part: TorchPart; orientation: Quaternion; color: string; metalness?: number }) {
  const middle = useMemo(
    () => new Vector3(...part.tip).add(new Vector3(...part.base)).multiplyScalar(0.5),
    [part],
  )
  const height = new Vector3(...part.tip).distanceTo(new Vector3(...part.base))
  return (
    <mesh position={middle} quaternion={orientation}>
      <cylinderGeometry args={[part.tipRadius, part.baseRadius, height, SEGMENTS]} />
      <meshStandardMaterial color={color} metalness={metalness} roughness={0.45} />
    </mesh>
  )
}

// The torch at the scrub position on the selected seam, in the pose the torch maths gives there. Nothing is drawn with no
// seam selected, while the poses are still being worked out, or when the pose is not one that can be drawn.
export function TorchPreview() {
  const selectedId = useStore((s) => s.selectedId)
  const entry = useStore((s) => s.posesForSelected)
  const scrubS = useStore((s) => s.scrubS)
  const bbox = useStore((s) => s.part?.bbox)
  const seam = useVisibleSeams().find((s) => s.id === selectedId)

  const poses = seam ? posesFor({ posesForSelected: entry }, seam) : null
  const pose = useMemo(() => (seam && poses && poses.length > 0 ? poseAt(poses, scrubS, seam.closed) : null), [seam, poses, scrubS])
  const scale = useMemo(() => {
    if (!bbox) return 1
    const diagonal = Math.hypot(bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2])
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, diagonal / REFERENCE_DIAGONAL_MM))
  }, [bbox])
  const placed = useMemo(() => (pose ? placeTorch(pose, scale) : null), [pose, scale])
  const orientation = useMemo(() => (pose ? new Quaternion(...pose.q).multiply(Y_TO_Z) : null), [pose])
  const colors = useMemo(() => ({ body: cssVar('--text-1'), nozzle: cssVar('--warn'), wire: cssVar('--ok') }), [])

  if (!placed || !orientation) return null
  return (
    <group name="torch-preview">
      <Part part={placed.body} orientation={orientation} color={colors.body} />
      <Part part={placed.nozzle} orientation={orientation} color={colors.nozzle} metalness={0.7} />
      <Part part={placed.wire} orientation={orientation} color={colors.wire} metalness={0} />
    </group>
  )
}
