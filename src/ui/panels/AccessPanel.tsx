import { ARM_BOUNDS, type ArmParams, type Port } from '../../core/snake/arm'
import type { Explained } from '../../core/job/plan'
import { useStore } from '../../state/store'
import { Button } from '../kit/Button'
import { NumberField } from '../kit/NumberField'
import { Tooltip } from '../kit/Tooltip'
import { portRows } from './portRows'

export const NEED_PART_FOR_PORT = 'Load a part first. A port is a hole in the part, so there is nothing to place it on yet.'

const ARM_FIELDS: Array<{ key: keyof ArmParams; label: string; unit: string }> = [
  { key: 'links', label: 'Links', unit: '' },
  { key: 'linkLengthMm', label: 'Link length', unit: 'mm' },
  { key: 'diameterMm', label: 'Diameter', unit: 'mm' },
  { key: 'maxBendDeg', label: 'Bend limit', unit: 'deg' },
  { key: 'torchLengthMm', label: 'Torch length', unit: 'mm' },
]

// The number in the text box, or what was wrong with it.
export function parseNumber(text: string, label: string): number | Explained {
  const value = Number(text.trim().replace(',', '.'))
  if (text.trim() !== '' && Number.isFinite(value)) return value
  return {
    what: `${label} was not changed because "${text.trim()}" is not a number.`,
    why: 'The field takes a plain number such as 600 or 12.5.',
    next: `Type a number for ${label.toLowerCase()}, then press Enter.`,
  }
}

function ArmFields() {
  const arm = useStore((s) => s.arm)
  const setArm = useStore((s) => s.setArm)
  return (
    <section aria-label="Arm" className="flex flex-col gap-1.5 border-b border-line px-3 py-3">
      <h3 className="text-xs font-semibold text-ink-0">Snake arm</h3>
      {ARM_FIELDS.map(({ key, label, unit }) => (
        <NumberField
          key={key}
          label={label}
          unit={unit}
          value={String(arm[key])}
          hint={<span className="text-[11px] text-ink-2">{`${ARM_BOUNDS[key].min} to ${ARM_BOUNDS[key].max}${unit ? ` ${unit}` : ''}`}</span>}
          onCommit={(text) => {
            const value = parseNumber(text, label)
            if (typeof value !== 'number') return value
            setArm({ [key]: value })
            return null
          }}
        />
      ))}
    </section>
  )
}

function PortCard({ port, row, selected }: { port: Port; row: ReturnType<typeof portRows>[number]; selected: boolean }) {
  const { selectPort, movePort, setPortDiameter, deletePort } = useStore.getState()
  const axes = ['X', 'Y', 'Z'] as const
  return (
    <li
      aria-label={`Port ${port.id}`}
      className={`flex flex-col gap-1.5 rounded-sm border px-2 py-2 ${selected ? 'border-brand' : 'border-line'}`}
      onFocusCapture={() => selectPort(port.id)}
      onClick={() => selectPort(port.id)}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-ink-0">{port.id}</span>
        <button
          type="button"
          onClick={() => deletePort(port.id)}
          className="rounded-sm text-[11px] text-ink-2 outline-none hover:text-err focus-visible:ring-1 focus-visible:ring-brand"
        >
          Delete {port.id}
        </button>
      </div>
      {axes.map((axis, i) => (
        <NumberField
          key={axis}
          label={`${port.id} ${axis}`}
          unit="mm"
          value={String(parseFloat(port.position[i]!.toFixed(1)))}
          onCommit={(text) => {
            const value = parseNumber(text, `Port ${axis}`)
            if (typeof value !== 'number') return value
            const current = useStore.getState().ports.find((p) => p.id === port.id)
            if (!current) return null
            const position = [...current.position] as [number, number, number]
            position[i] = value
            movePort(port.id, position)
            return null
          }}
        />
      ))}
      <NumberField
        label={`${port.id} Diameter`}
        unit="mm"
        value={row.diameter}
        onCommit={(text) => {
          const value = parseNumber(text, 'Port diameter')
          if (typeof value !== 'number') return value
          setPortDiameter(port.id, value)
          return null
        }}
      />
      <p className="num text-ink-2">Direction {row.direction}</p>
    </li>
  )
}

function PortList() {
  const hasPart = useStore((s) => s.part !== null)
  const ports = useStore((s) => s.ports)
  const selectedPortId = useStore((s) => s.selectedPortId)
  const placing = useStore((s) => s.placingPort)
  const setPlacingPort = useStore((s) => s.setPlacingPort)
  const rows = portRows(ports)
  const add = (
    <Button disabled={!hasPart} aria-pressed={placing} onClick={() => setPlacingPort(!placing)}>
      {placing ? 'Cancel placing' : 'Add port'}
    </Button>
  )
  return (
    <section aria-label="Ports" className="flex flex-col gap-2 border-b border-line px-3 py-3">
      <h3 className="text-xs font-semibold text-ink-0">Ports</h3>
      {hasPart ? (
        add
      ) : (
        <Tooltip content={NEED_PART_FOR_PORT}>
          <span tabIndex={0} className="self-start rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-brand">
            {add}
          </span>
        </Tooltip>
      )}
      {placing && <p className="text-ink-1">Click the part where the arm goes in. Press Escape to cancel.</p>}
      {ports.length === 0 ? (
        <p className="text-ink-2">No ports yet. Seams that the torch cannot reach need a port for the snake arm.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ports.map((port, i) => (
            <PortCard key={port.id} port={port} row={rows[i]!} selected={port.id === selectedPortId} />
          ))}
        </ul>
      )}
    </section>
  )
}

export function AccessPanel() {
  return (
    <div className="shrink-0">
      <PortList />
      <ArmFields />
    </div>
  )
}
