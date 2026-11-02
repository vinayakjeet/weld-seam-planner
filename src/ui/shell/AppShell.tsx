import { TooltipProvider } from '../kit/Tooltip'
import { Inspector } from '../panels/Inspector'
import { SeamPanel } from '../panels/SeamPanel'
import { Viewport } from '../viewport/Viewport'
import { StatusBar } from './StatusBar'
import { TopBar } from './TopBar'
import { useDropGuard } from './useDropGuard'
import { useTorchSync } from './useTorchSync'

export function AppShell() {
  useDropGuard()
  useTorchSync()
  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <SeamPanel />
          <Viewport />
          <Inspector />
        </div>
        <StatusBar />
      </div>
    </TooltipProvider>
  )
}
