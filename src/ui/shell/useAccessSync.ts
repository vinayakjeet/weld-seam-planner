import { useEffect } from 'react'
import { startAccessSync } from '../../state/flows'
import { getGeometryClient } from '../../worker/client'

// Keeps the torch access of the accepted seams current for as long as the app is open.
export function useAccessSync(): void {
  useEffect(() => startAccessSync(getGeometryClient()), [])
}
