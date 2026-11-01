import { useEffect, useState } from 'react'
import { fetchManifest, type ManifestOutcome } from '../../state/flows'

let pending: Promise<ManifestOutcome> | null = null

// One request per page load; a failure is forgotten so the next time the import panel opens it tries again.
function loadOnce(): Promise<ManifestOutcome> {
  pending ??= fetchManifest(fetch).then((outcome) => {
    if (outcome.status === 'error') pending = null
    return outcome
  })
  return pending
}

export function useSampleManifest(): ManifestOutcome | { status: 'loading' } {
  const [outcome, setOutcome] = useState<ManifestOutcome | { status: 'loading' }>({ status: 'loading' })
  useEffect(() => {
    let live = true
    void loadOnce().then((result) => {
      if (live) setOutcome(result)
    })
    return () => {
      live = false
    }
  }, [])
  return outcome
}
