import { useEffect } from 'react'
import { startTorchSync } from '../../state/flows'
import { getGeometryClient } from '../../worker/client'

// Keeps welding positions and torch poses current for as long as the app is open.
export function useTorchSync(): void {
  useEffect(() => startTorchSync(getGeometryClient()), [])
}
