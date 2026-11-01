import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../../state/store'
import { Button } from '../kit/Button'
import { Tab, TabList, TabPanel, Tabs } from '../kit/Tabs'
import { DetectionSettings } from './DetectionSettings'
import { seamRows } from './seamRows'
import { acceptAllLabel } from './seamText'

const COLUMNS = [
  { key: 'n', label: '#', title: 'Seam number' },
  { key: 'label', label: 'Label', title: 'Label' },
  { key: 'type', label: 'Type', title: 'Joint type' },
  { key: 'len', label: 'Len', title: 'Length in millimetres' },
  { key: 'wps', label: 'WPS', title: 'Welding procedure' },
  { key: 'pos', label: 'Pos', title: 'Welding position' },
  { key: 'acc', label: 'Acc', title: 'Access class' },
  { key: 'status', label: '', title: 'Status' },
]

const GRID = 'grid grid-cols-[22px_minmax(0,1fr)_34px_34px_34px_28px_28px_16px] items-center gap-x-1.5 px-3'

const STATUS_DOT = {
  accepted: 'bg-seam-accepted',
  candidate: 'bg-seam-candidate',
  rejected: 'bg-err',
} as const

function EmptyMessage({ partLoaded, busy }: { partLoaded: boolean; busy: boolean }) {
  if (!partLoaded) {
    return (
      <p>
        No seams yet. Seam candidates appear here once a part is loaded.
        <br />
        Drop an STL file or pick a sample to start.
      </p>
    )
  }
  if (busy) return <p>Detecting seams.</p>
  return (
    <p>No crease seams found. Touching bodies need contact detection, which is not available yet; lower the crease angle or load a merged part.</p>
  )
}

function AcceptAll() {
  const [threshold, setThreshold] = useState(0.7)
  const acceptAbove = useStore((s) => s.acceptAbove)
  const hasSeams = useStore((s) => s.seams.length > 0)
  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-line px-3 py-2">
      <Button disabled={!hasSeams} onClick={() => acceptAbove(threshold)} className="w-full">
        {acceptAllLabel(threshold)}
      </Button>
      <input
        type="range"
        aria-label="Confidence threshold"
        min={0}
        max={1}
        step={0.05}
        value={threshold}
        onChange={(e) => setThreshold(Number(e.target.value))}
        className="w-full accent-brand"
      />
    </div>
  )
}

function SeamTable() {
  const seams = useStore((s) => s.seams)
  const statusById = useStore((s) => s.statusById)
  const selectedId = useStore((s) => s.selectedId)
  const hoverId = useStore((s) => s.hoverId)
  const partLoaded = useStore((s) => s.part !== null)
  const busy = useStore((s) => s.detectBusy)
  const select = useStore((s) => s.select)
  const hover = useStore((s) => s.hover)
  const toggleAccepted = useStore((s) => s.toggleAccepted)
  const rows = useMemo(() => seamRows(seams, statusById), [seams, statusById])
  const body = useRef<HTMLDivElement>(null)

  // A seam picked in the viewport may be a row that is scrolled out of sight.
  useEffect(() => {
    if (selectedId === null) return
    body.current?.querySelector(`[data-seam-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  return (
    <div role="table" aria-label="Seams" className="flex h-full flex-col">
      <div role="row" className={`${GRID} h-7 shrink-0 border-b border-line text-[11px] text-ink-2`}>
        {COLUMNS.map((c) => (
          <span key={c.key} role="columnheader" title={c.title} className="truncate">
            {c.label}
          </span>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="grid flex-1 place-items-center px-6 text-center text-ink-2">
          <EmptyMessage partLoaded={partLoaded} busy={busy} />
        </div>
      ) : (
        <div ref={body} className="min-h-0 flex-1 overflow-y-auto">
          {rows.map((row) => (
            <div
              key={row.id}
              role="row"
              tabIndex={0}
              aria-selected={selectedId === row.id}
              data-seam-id={row.id}
              data-status={row.status}
              onClick={() => select(row.id)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  select(row.id)
                }
              }}
              onMouseEnter={() => hover(row.id)}
              onMouseLeave={() => hover(null)}
              className={`${GRID} h-7 cursor-pointer border-b border-line/50 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand ${
                selectedId === row.id ? 'bg-brand/20 text-ink-0' : hoverId === row.id ? 'bg-surface-2 text-ink-1' : 'text-ink-1'
              }`}
            >
              <span role="cell" className="num text-ink-2">
                {row.n}
              </span>
              <span role="cell" className="truncate text-ink-0">
                {row.label}
              </span>
              <span role="cell" className="truncate">
                {row.type}
              </span>
              <span role="cell" className="num text-right">
                {row.length}
              </span>
              {['WPS', 'Pos', 'Acc'].map((column) => (
                <span key={column} role="cell" aria-label={`${column} not set`} className="text-ink-2">
                  -
                </span>
              ))}
              <span role="cell">
                <button
                  type="button"
                  aria-label={`Accept seam ${row.label}`}
                  aria-pressed={row.status === 'accepted'}
                  title={row.status}
                  onClick={() => toggleAccepted(row.id)}
                  className="grid size-4 place-items-center rounded-full outline-none focus-visible:ring-1 focus-visible:ring-brand"
                >
                  <span className={`size-2 rounded-full ${STATUS_DOT[row.status]}`} />
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function SeamPanel() {
  return (
    <aside aria-label="Seam list" className="flex min-h-0 w-[300px] shrink-0 flex-col border-r border-line bg-surface-1">
      <Tabs defaultValue="seams" className="flex min-h-0 flex-1 flex-col">
        <TabList label="Left panel">
          <Tab value="seams">Seams</Tab>
          <Tab value="detection">Detection</Tab>
        </TabList>
        <TabPanel value="seams" className="data-[state=active]:flex data-[state=active]:flex-col">
          <div className="flex shrink-0 gap-1.5 border-b border-line px-3 py-2">
            {['Candidates', 'Accepted', 'Warnings'].map((chip) => (
              <span key={chip} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2">
                {chip}
              </span>
            ))}
          </div>
          <AcceptAll />
          <SeamTable />
        </TabPanel>
        <TabPanel value="detection">
          <DetectionSettings />
        </TabPanel>
      </Tabs>
    </aside>
  )
}
