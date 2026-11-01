import './zUp'
import { Canvas } from '@react-three/fiber'
import { useStore } from '../../state/store'
import { ErrorBanner } from '../shell/ErrorBanner'
import { ProgressBar } from '../shell/ProgressBar'
import { EmptyState } from './EmptyState'
import { Scene } from './Scene'
import { UnitsDialog } from './UnitsDialog'

export function Viewport() {
  const showImport = useStore((s) => s.part === null || s.activeStep === 'import')
  const overSeam = useStore((s) => s.hoverId !== null)

  return (
    <main aria-label="3D viewport" className={`relative min-w-0 flex-1 bg-viewport ${overSeam ? 'cursor-pointer' : ''}`}>
      <Canvas
        frameloop="demand"
        camera={{ position: [350, -450, 300], up: [0, 0, 1], near: 1, far: 100000, fov: 40 }}
      >
        <Scene />
      </Canvas>
      {showImport && <EmptyState />}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-2 p-3">
        <ProgressBar />
        <ErrorBanner />
      </div>
      <UnitsDialog />
    </main>
  )
}
