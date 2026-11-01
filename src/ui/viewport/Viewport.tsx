import './zUp'
import { Canvas } from '@react-three/fiber'
import { EmptyState } from './EmptyState'
import { Scene } from './Scene'

export function Viewport() {
  return (
    <main aria-label="3D viewport" className="relative min-w-0 flex-1 bg-viewport">
      <Canvas
        frameloop="demand"
        camera={{ position: [350, -450, 300], up: [0, 0, 1], near: 1, far: 100000, fov: 40 }}
      >
        <Scene />
      </Canvas>
      <EmptyState />
    </main>
  )
}
