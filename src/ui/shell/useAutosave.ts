import { useEffect } from 'react'
import { flushAutosave, idbStorage, startAutosave } from '../../state/autosave'

// Saves the plan to the browser for as long as the app is open. A change still waiting for the delay is written when
// the page is hidden or closed, which is the last moment the page is sure to run.
export function useAutosave(): void {
  useEffect(() => {
    const stop = startAutosave(idbStorage)
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void flushAutosave()
    }
    const onPageHide = () => void flushAutosave()
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onPageHide)
      stop()
    }
  }, [])
}
