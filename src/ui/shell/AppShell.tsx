import { TooltipProvider } from '../kit/Tooltip'
import { Inspector } from '../panels/Inspector'
import { SeamPanel } from '../panels/SeamPanel'
import { Viewport } from '../viewport/Viewport'
import { RestoreDialog } from './RestoreDialog'
import { StatusBar } from './StatusBar'
import { Timeline } from './Timeline'
import { TopBar } from './TopBar'
import { useAccessSync } from './useAccessSync'
import { useAutosave } from './useAutosave'
import { useDropGuard } from './useDropGuard'
import { usePreflightSync } from './usePreflightSync'
import { useTimingSync } from './useTimingSync'
import { useTorchSync } from './useTorchSync'

export function AppShell() {
  useDropGuard()
  useTorchSync()
  usePreflightSync()
  useTimingSync()
  useAccessSync()
  useAutosave()
  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <SeamPanel />
          <Viewport />
          <Inspector />
        </div>
        <Timeline />
        <StatusBar />
        <RestoreDialog />
      </div>
    </TooltipProvider>
  )
}
