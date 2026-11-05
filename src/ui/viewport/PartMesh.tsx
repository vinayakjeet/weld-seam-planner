import { useEffect, useMemo, type Ref } from 'react'
import { DoubleSide, type Mesh } from 'three'
import { useStore } from '../../state/store'
import { cssVar } from './cssVar'
import { buildDisplayGeometry } from './displayGeometry'
import { xrayMaterial } from './xray'

export function PartMesh({ ref }: { ref?: Ref<Mesh> }) {
  const display = useStore((s) => s.display)
  const geometry = useMemo(() => (display ? buildDisplayGeometry(display) : null), [display])
  const color = useMemo(() => cssVar('--part'), [])
  const material = xrayMaterial(useStore((s) => s.xray))

  useEffect(
    () => () => {
      geometry?.dispose()
    },
    [geometry],
  )

  if (!geometry) return null
  // Double sided so an inside-out export still shows; the offset keeps seams drawn on the surface from z-fighting it.
  return (
    <mesh ref={ref} geometry={geometry}>
      <meshStandardMaterial
        color={color}
        flatShading
        side={DoubleSide}
        opacity={material.opacity}
        transparent={material.transparent}
        depthWrite={material.depthWrite}
        roughness={0.85}
        metalness={0.05}
        polygonOffset
        polygonOffsetFactor={2}
        polygonOffsetUnits={2}
      />
    </mesh>
  )
}
