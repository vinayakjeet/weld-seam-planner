import { lazy, Suspense } from 'react'
import { TooltipProvider } from '../kit/Tooltip'
import { Inspector } from '../panels/Inspector'
import { SeamPanel } from '../panels/SeamPanel'
import { RestoreDialog } from './RestoreDialog'
import { ShortcutSheet } from './ShortcutSheet'
import { StatusBar } from './StatusBar'
import { Timeline } from './Timeline'
import { TopBar } from './TopBar'
import { useAccessSync } from './useAccessSync'
import { useInsertionClock } from './useInsertionClock'
import { useAutosave } from './useAutosave'
import { useDeepLink } from './useDeepLink'
import { useDropGuard } from './useDropGuard'
import { usePlaybackSync } from './usePlaybackSync'
import { usePreflightSync } from './usePreflightSync'
import { useTimingSync } from './useTimingSync'
import { useTorchSync } from './useTorchSync'

const Viewport = lazy(() => import('../viewport/Viewport').then((m) => ({ default: m.Viewport })))

function ViewportFallback() {
  return (
    <main aria-label="3D viewport" className="relative flex min-w-0 flex-1 items-center justify-center bg-viewport text-sm text-ink-2" role="status">
      Loading the 3D viewport
    </main>
  )
}

export function AppShell() {
  useDropGuard()
  useTorchSync()
  usePreflightSync()
  useTimingSync()
  useAccessSync()
  useInsertionClock()
  usePlaybackSync()
  useAutosave()
  useDeepLink()
  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        <TopBar />
        <div className="flex min-h-0 flex-1">
          <SeamPanel />
          <Suspense fallback={<ViewportFallback />}>
            <Viewport />
          </Suspense>
          <Inspector />
        </div>
        <Timeline />
        <StatusBar />
        <RestoreDialog />
        <ShortcutSheet />
      </div>
    </TooltipProvider>
  )
}
