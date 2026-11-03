const MAX_LENGTH = 10

// A short code for the narrow WPS column. A long id loses its process segment (GMAW) before it is cut, so
// WPS-GMAW-SPRAY-FW6 reads SPRAY-FW6; the tooltip carries the full name.
export function wpsCode(procedure: { id: string }): string {
  let code = procedure.id.toUpperCase().replace(/^WPS-/, '')
  if (code.length > MAX_LENGTH && code.includes('-')) code = code.slice(code.indexOf('-') + 1)
  return code.slice(0, MAX_LENGTH)
}
