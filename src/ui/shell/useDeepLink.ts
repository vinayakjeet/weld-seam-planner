import { useEffect } from 'react'
import { openDeepLink } from '../../state/deepLinkFlow'
import { getGeometryClient } from '../../worker/client'
import { parseDeepLink } from './deepLink'

// React runs an effect twice in development; the address is read and acted on once per page load.
let started = false

// Opens the sample, and the demo, that the address asks for. Must come after useAutosave, so the demo can pause it.
export function useDeepLink(): void {
  useEffect(() => {
    if (started) return
    started = true
    const link = parseDeepLink(window.location.search)
    if (link.sample === null && !link.demo) return
    void openDeepLink(link, getGeometryClient(), (url) => fetch(url))
  }, [])
}
