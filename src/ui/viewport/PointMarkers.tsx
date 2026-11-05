import { useEffect, useMemo } from 'react'
import { CanvasTexture } from 'three'
import type { Vec3 } from '../../core/math/vec3'
import { toLocalArray } from '../../core/mesh/displayOrigin'
import { useOrigin } from './origin'

type Shape = 'dot' | 'ring'

const TEXTURE_PX = 64

function shapeTexture(shape: Shape): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TEXTURE_PX
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const c = TEXTURE_PX / 2
    ctx.fillStyle = ctx.strokeStyle = '#fff'
    ctx.beginPath()
    if (shape === 'dot') {
      ctx.arc(c, c, c - 4, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.lineWidth = 7
      ctx.arc(c, c, c - 8, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  return new CanvasTexture(canvas)
}

interface PointMarkersProps {
  positions: readonly Vec3[]
  shape: Shape
  color: string
  // Screen size in pixels; markers keep it however far the camera is.
  size: number
}

// Round screen-space markers drawn over the part, for clicked points and the cursor.
export function PointMarkers({ positions, shape, color, size }: PointMarkersProps) {
  const texture = useMemo(() => shapeTexture(shape), [shape])
  useEffect(() => () => texture.dispose(), [texture])
  const origin = useOrigin()
  const array = useMemo(() => toLocalArray(positions.flat(), origin), [positions, origin])
  if (positions.length === 0) return null
  return (
    <points key={positions.length} renderOrder={5} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[array, 3]} />
      </bufferGeometry>
      <pointsMaterial map={texture} color={color} size={size} sizeAttenuation={false} transparent alphaTest={0.3} depthTest={false} />
    </points>
  )
}
