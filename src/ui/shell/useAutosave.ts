import { useEffect } from 'react'
import { idbStorage, startAutosave } from '../../state/autosave'

// Saves the plan to the browser for as long as the app is open.
export function useAutosave(): void {
  useEffect(() => startAutosave(idbStorage), [])
}
