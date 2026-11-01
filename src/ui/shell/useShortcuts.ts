import { useEffect } from 'react'
import { useStore } from '../../state/store'
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
      event.preventDefault()
      if (shortcut === 'fit') fit()
      else if (shortcut === 'undo') useStore.temporal.getState().undo()
      else useStore.temporal.getState().redo()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fit])
}
