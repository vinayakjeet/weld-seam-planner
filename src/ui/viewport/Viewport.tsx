import './zUp'
import { Canvas } from '@react-three/fiber'
import { useStore } from '../../state/store'
import { ErrorBanner } from '../shell/ErrorBanner'
import { InfoNotice } from '../shell/InfoNotice'
import { ToolNotice } from '../shell/ToolNotice'
import { ProgressBar } from '../shell/ProgressBar'
import { EmptyState } from './EmptyState'
import { GIZMO_MARGIN, GIZMO_RADIUS } from './gizmo'
import { Scene } from './Scene'
import { UnitsDialog } from './UnitsDialog'
import { ViewToolbar } from './ViewToolbar'

// Room the messages leave on the right for the view cube.
const CUBE_CLEARANCE = GIZMO_MARGIN + GIZMO_RADIUS + 8

function Messages() {
  return (
    <>
      <ProgressBar />
      <ErrorBanner />
      <ToolNotice />
      <InfoNotice />
    </>
  )
}

export function Viewport() {
  const showImport = useStore((s) => s.part === null || s.activeStep === 'import')
  const overSeam = useStore((s) => s.hoverId !== null)
  const aiming = useStore((s) => s.tool.tool === 'draw' || s.tool.tool === 'split')

  return (
    <main aria-label="3D viewport" className={`relative min-w-0 flex-1 bg-viewport ${aiming ? 'cursor-crosshair' : overSeam ? 'cursor-pointer' : ''}`}>
      <Canvas
        frameloop="demand"
        // No tone mapping, so the lit faces show the part colour and the seam colours as the tokens give them.
        flat
        gl={{ antialias: true }}
        camera={{ position: [350, -450, 300], up: [0, 0, 1], near: 1, far: 100000, fov: 40 }}
      >
        <Scene />
      </Canvas>
      {showImport ? (
        // The messages stand above the import box and push it down, so they never cover its heading.
        <div className="absolute inset-0 z-10 flex flex-col">
          <div className="pointer-events-none flex flex-col items-center gap-2 px-3 pt-3 empty:hidden">
            <Messages />
          </div>
          <EmptyState />
        </div>
      ) : (
        <>
          <ViewToolbar />
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-2 p-3" style={{ paddingRight: CUBE_CLEARANCE }}>
            <Messages />
          </div>
        </>
      )}
      <UnitsDialog />
    </main>
  )
}
