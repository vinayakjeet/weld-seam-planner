// The page shares memory with the geometry worker only when it is cross-origin isolated, which needs both headers on
// the document. Vercel, the Vite dev server and the Vite preview server send the same pair.
export const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
} as const
