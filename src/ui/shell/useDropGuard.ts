import { useEffect } from 'react'
import { dropFile } from '../../state/flows'
import { getGeometryClient } from '../../worker/client'
import { installDropGuard } from './dropGuard'

// Only the first dropped file counts, same as the import panel.
export function useDropGuard(): void {
  useEffect(() => installDropGuard(window, (files) => dropFile(files[0], getGeometryClient())), [])
}
