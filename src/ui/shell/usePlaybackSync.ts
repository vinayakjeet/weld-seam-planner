import { useEffect } from 'react'
import { startPlaybackSync } from '../../state/playbackSync'
import { getGeometryClient } from '../../worker/client'

// Keeps the torch path current while a step that plays it back is open.
export function usePlaybackSync(): void {
  useEffect(() => startPlaybackSync(getGeometryClient()), [])
}
