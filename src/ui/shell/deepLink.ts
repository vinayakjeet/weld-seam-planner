export interface DeepLink {
  sample: string | null
  demo: boolean
}

// What the address asks for. The sample id is only text here: whether it names a sample is for the caller to check against
// the manifest, so it never reaches a file path. Only demo=1 turns the demo on.
export function parseDeepLink(search: string): DeepLink {
  const params = new URLSearchParams(search)
  const sample = params.get('sample')?.trim() ?? ''
  return { sample: sample === '' ? null : sample, demo: params.get('demo') === '1' }
}
