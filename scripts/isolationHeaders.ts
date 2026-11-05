import type { Connect, Plugin } from 'vite'

// The page shares memory with the geometry worker only when it is cross-origin isolated, which needs both headers on
// the document. Vercel, the Vite dev server and the Vite preview server send the same pair.
export const ISOLATION_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
} as const

const sendIsolation: Connect.NextHandleFunction = (_req, res, next) => {
  for (const [key, value] of Object.entries(ISOLATION_HEADERS)) res.setHeader(key, value)
  next()
}

// Vite's server.headers and preview.headers reach only full responses, not a 304. WebKit checks the worker's own
// response against the page's embedder policy, so a reload that revalidates the worker would block it.
export function isolationHeaders(): Plugin {
  return {
    name: 'isolation-headers',
    configureServer: (server) => void server.middlewares.use(sendIsolation),
    configurePreviewServer: (server) => void server.middlewares.use(sendIsolation),
  }
}
