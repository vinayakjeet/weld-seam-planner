import type { Procedure } from '../../core/job/schema'

// Assigned ids the library cannot show: a plan restored against a library that lost the procedure.
export function missingProcedureIds(assigned: readonly string[], library: readonly Pick<Procedure, 'id'>[]): string[] {
  const known = new Set(library.map((p) => p.id))
  return [...new Set(assigned.filter((id) => id !== '' && !known.has(id)))]
}

// An option of the procedure select. The alternatives that cover the seam's position say so; the chosen one shows its
// name alone, because the closed select shows the chosen label and has no room for the note.
export function procedureOptionLabel(procedure: Pick<Procedure, 'name' | 'positions'>, position: string | null, chosen: boolean): string {
  const covers = position !== null && (procedure.positions as string[]).includes(position)
  return covers && !chosen ? `${procedure.name} (matches ${position})` : procedure.name
}
