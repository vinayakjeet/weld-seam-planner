import type { Procedure } from '../../core/job/schema'

// Assigned ids the library cannot show: a plan restored against a library that lost the procedure.
export function missingProcedureIds(assigned: readonly string[], library: readonly Pick<Procedure, 'id'>[]): string[] {
  const known = new Set(library.map((p) => p.id))
  return [...new Set(assigned.filter((id) => id !== '' && !known.has(id)))]
}
