import { useMemo } from 'react'
import { DoubleSide, Quaternion, Vector3 } from 'three'
import { classOf, FAR_RANGE_MM, NEAR_RANGE_MM } from '../../core/access/clearance'
import { rotate } from '../../core/math/quat'
import { poseAt } from '../../core/torch/frames'
import { stationsFor } from '../../state/accessSlice'
import { posesFor } from '../../state/torchSlice'
import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { cssVar } from './cssVar'
import { coneGeometry, nearestStation, type ConeShape } from './coneGeometry'
import { useOrigin } from './origin'

const SEGMENTS = 32
// A cone opens from its apex at +Y in three.js; the free cone opens along minus tool z, so +Y has to become tool z.
const UP = new Vector3(0, 1, 0)

function Cone({ shape, color, opacity }: { shape: ConeShape; color: string; opacity: number }) {
  const origin = useOrigin()
  const centre = useMemo(
    () => new Vector3(...shape.apex).add(new Vector3(...shape.baseCentre)).multiplyScalar(0.5).sub(new Vector3(...origin)),
    [shape, origin],
  )
  const orientation = useMemo(() => new Quaternion().setFromUnitVectors(UP, new Vector3(...shape.axis).negate()), [shape])
  return (
    <mesh position={centre} quaternion={orientation} renderOrder={3}>
      <coneGeometry args={[shape.baseRadius, shape.lengthMm, SEGMENTS, 1, true]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} side={DoubleSide} depthWrite={false} />
    </mesh>
  )
}

// The free cone at the torch preview: 300 mm long at the far clearance, and a second, 60 mm cone at the near one, both
// from the station nearest to the scrub position and in the colour of that station's class. Nothing is drawn without a
// selected seam, without a current analysis, or while the poses are still being worked out.
export function AccessCone() {
  const selectedId = useStore((s) => s.selectedId)
  const entry = useStore((s) => s.posesForSelected)
  const scrubS = useStore((s) => s.scrubS)
  const stationsById = useStore((s) => s.stationsById)
  const accessPointsById = useStore((s) => s.accessPointsById)
  const seam = useVisibleSeams().find((s) => s.id === selectedId)

  const poses = seam ? posesFor({ posesForSelected: entry }, seam) : null
  const pose = useMemo(() => (seam && poses && poses.length > 0 ? poseAt(poses, scrubS, seam.closed) : null), [seam, poses, scrubS])
  const stations = seam ? stationsFor({ stationsById, accessPointsById }, seam) : null
  const station = stations && stations.length > 0 ? nearestStation(stations, scrubS) : null

  const cones = useMemo(() => {
    if (!pose || !station) return null
    const z = rotate(pose.q, [0, 0, 1])
    return {
      far: station.clearanceDeg > 0 ? coneGeometry(pose.p, z, station.clearanceDeg, FAR_RANGE_MM) : null,
      near: station.nearClearanceDeg > 0 ? coneGeometry(pose.p, z, station.nearClearanceDeg, NEAR_RANGE_MM) : null,
      color: cssVar(`--access-${classOf(station.clearanceDeg, station.nearClearanceDeg)}`),
    }
  }, [pose, station])

  if (!cones) return null
  return (
    <group name="access-cone">
      {cones.far && <Cone shape={cones.far} color={cones.color} opacity={0.12} />}
      {cones.near && <Cone shape={cones.near} color={cones.color} opacity={0.3} />}
    </group>
  )
}
