import { useEffect } from 'react'
import { acceptSelected, chooseTool, exportPlan, redoEdit, rejectSelected, removeSelected, reverseSelected, toolEvent, undoEdit } from '../../state/flows'
import { STEPS, useStore } from '../../state/store'
import { getGeometryClient } from '../../worker/client'
import { shortcutFor, shortcutGate, stepForShortcut, viewForShortcut, type StepShortcut, type ViewShortcut } from './shortcuts'

export function useShortcuts(fit: () => void, showView: (index: number) => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const shortcut = shortcutFor({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        code: event.code,
        target: event.target as HTMLElement | null,
      })
      if (!shortcut) return
      const { part, tool, helpOpen } = useStore.getState()
      // With the sheet open only its own key works, and Escape is left to the dialog that closes it.
      if (!shortcutGate(shortcut, helpOpen)) return
      if (shortcut === 'help') {
        event.preventDefault()
        useStore.getState().setHelpOpen(!helpOpen)
        return
      }
      if (shortcut.startsWith('step')) {
        event.preventDefault()
        useStore.getState().setActiveStep(stepForShortcut(shortcut as StepShortcut, STEPS))
        return
      }
      // Enter, Escape and Backspace only mean something to an armed tool; otherwise they belong to the page.
      const toolKey = shortcut === 'finish' || shortcut === 'cancel' || shortcut === 'undoPoint'
      if (toolKey && tool.tool === 'select') return
      // The edit keys have nothing to act on until a part is open.
      // Space plays the timeline of the steps that show one, and is left to the page elsewhere.
      if (shortcut === 'play') {
        const { activeStep, toggle } = useStore.getState()
        if (!part || (activeStep !== 'sequence' && activeStep !== 'export')) return
        event.preventDefault()
        toggle()
        return
      }
      // Export is let through without a part: it tells the user why there is nothing to write.
      if (shortcut.startsWith('view')) {
        if (!part) return
        event.preventDefault()
        showView(viewForShortcut(shortcut as ViewShortcut))
        return
      }
      if (!toolKey && !part && shortcut !== 'fit' && shortcut !== 'undo' && shortcut !== 'redo' && shortcut !== 'export') return
      event.preventDefault()
      const client = getGeometryClient()
      if (shortcut === 'fit') fit()
      else if (shortcut === 'undo') undoEdit()
      else if (shortcut === 'redo') redoEdit()
      else if (shortcut === 'draw' || shortcut === 'split') void chooseTool(shortcut, client)
      else if (shortcut === 'accept') acceptSelected()
      else if (shortcut === 'reject') rejectSelected()
      else if (shortcut === 'export') void exportPlan(client)
      else if (shortcut === 'xray') useStore.getState().toggleXray()
      else if (shortcut === 'reverse') reverseSelected()
      else if (shortcut === 'remove') removeSelected()
      else void toolEvent({ type: shortcut as 'finish' | 'cancel' | 'undoPoint' }, client)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fit, showView])
}
