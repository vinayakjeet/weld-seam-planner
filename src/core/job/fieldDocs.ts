export interface FieldRow {
  path: string
  type: string
  required: boolean
  description: string
}

interface Node {
  type?: string | string[]
  const?: unknown
  enum?: unknown[]
  anyOf?: Node[]
  items?: Node
  prefixItems?: Node[]
  properties?: Record<string, Node>
  required?: string[]
  description?: string
}

// The overrides carry the procedure's keys, each optional; the procedure rows describe them once.
const NOT_EXPANDED = new Set(['seams[].overrides'])

// The values a node accepts, with unions, enums and type lists flattened into one list.
function alternatives(node: Node): string[] {
  if (node.anyOf) return node.anyOf.flatMap(alternatives)
  if (node.const !== undefined) return [JSON.stringify(node.const)]
  if (node.enum) return node.enum.map((value) => JSON.stringify(value))
  if (Array.isArray(node.type)) return node.type.flatMap((type) => alternatives({ type }))
  if (node.type === 'array') {
    if (node.prefixItems) {
      const parts = node.prefixItems.map(typeOf)
      return [parts.every((part) => part === parts[0]) ? `${group(parts[0]!)}[${parts.length}]` : `[${parts.join(', ')}]`]
    }
    return [node.items ? `${group(typeOf(node.items))}[]` : 'array']
  }
  return [node.type ?? 'any']
}

function typeOf(node: Node): string {
  const parts = alternatives(node)
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} or ${parts[parts.length - 1]}` : parts[0]!
}

const group = (type: string) => (type.includes(' ') ? `(${type})` : type)

// The object behind a nullable field, or the item object behind an array.
function inner(node: Node): Node | null {
  if (node.properties) return node
  if (node.anyOf) return node.anyOf.map(inner).find((n) => n !== null) ?? null
  if (node.type === 'array' && node.items && !node.prefixItems) return inner(node.items)
  return null
}

const descriptionOf = (node: Node): string => node.description ?? node.anyOf?.find((n) => n.description)?.description ?? ''

const childPrefix = (path: string, node: Node) => (node.type === 'array' && !node.prefixItems ? `${path}[]` : path)

// Every property of the generated JSON Schema in schema order, each object before its fields.
export function fieldRows(schema: object): FieldRow[] {
  const rows: FieldRow[] = []
  const walk = (object: Node, prefix: string) => {
    const required = new Set(object.required ?? [])
    for (const [key, node] of Object.entries(object.properties ?? {})) {
      const path = prefix === '' ? key : `${prefix}.${key}`
      rows.push({ path, type: typeOf(node), required: required.has(key), description: descriptionOf(node) })
      const child = inner(node)
      if (child && !NOT_EXPANDED.has(path)) walk(child, childPrefix(path, node.anyOf?.find((n) => inner(n) !== null) ?? node))
    }
  }
  walk(schema as Node, '')
  return rows
}

export const FIELD_MARKERS = { start: '<!-- job-fields:start -->', end: '<!-- job-fields:end -->' } as const

// The text with the table between the markers, or null when they are missing or out of order.
export function withFieldTable(text: string, table: string): string | null {
  const from = text.indexOf(FIELD_MARKERS.start)
  const to = text.indexOf(FIELD_MARKERS.end)
  if (from < 0 || to < from) return null
  return `${text.slice(0, from + FIELD_MARKERS.start.length)}\n\n${table.trimEnd()}\n\n${text.slice(to)}`
}

const cell = (text: string) => text.replace(/\|/g, '\\|')

export function renderFieldTable(rows: FieldRow[]): string {
  const lines = ['| Field | Type | Required | Meaning |', '| --- | --- | --- | --- |']
  for (const row of rows) lines.push(`| \`${row.path}\` | ${cell(row.type)} | ${row.required ? 'yes' : 'no'} | ${cell(row.description)} |`)
  return lines.join('\n') + '\n'
}
