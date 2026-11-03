import { useEffect } from 'react'
import { startPreflightSync } from '../../state/flows'
import { getGeometryClient } from '../../worker/client'

// Keeps the pre-flight answer current for as long as the app is open.
export function usePreflightSync(): void {
  useEffect(() => startPreflightSync(getGeometryClient()), [])
}
