import { useEffect } from 'react'
import { chooseTool, redoEdit, removeSelected, reverseSelected, toolEvent, undoEdit } from '../../state/flows'
import { useStore } from '../../state/store'
import { getGeometryClient } from '../../worker/client'
import { shortcutFor } from './shortcuts'

export function useShortcuts(fit: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return
      const shortcut = shortcutFor({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        target: event.target as HTMLElement | null,
      })
      if (!shortcut) return
      const { part, tool } = useStore.getState()
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
      if (!toolKey && !part && shortcut !== 'fit' && shortcut !== 'undo' && shortcut !== 'redo') return
      event.preventDefault()
      const client = getGeometryClient()
      if (shortcut === 'fit') fit()
      else if (shortcut === 'undo') undoEdit()
      else if (shortcut === 'redo') redoEdit()
      else if (shortcut === 'draw' || shortcut === 'split') void chooseTool(shortcut, client)
      else if (shortcut === 'reverse') reverseSelected()
      else if (shortcut === 'remove') removeSelected()
      else void toolEvent({ type: shortcut }, client)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fit])
}
