import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { accessFor } from '../../state/accessSlice'
import { reachFor } from '../../state/reachSlice'
import { positionFor } from '../../state/torchSlice'
import type { SelectMode } from '../../state/seamsSlice'
import { selectPlan } from '../../state/selectors'
import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { Button } from '../kit/Button'
import { PanelHeading } from '../kit/PanelHeading'
import { showsSeamTable } from './panelHeadings'
import { Tooltip } from '../kit/Tooltip'
import { Tab, TabList, TabPanel, Tabs } from '../kit/Tabs'
import { AccessChip } from './AccessChip'
import { AccessPanel } from './AccessPanel'
import { DetectionSettings } from './DetectionSettings'
import { ManualTools } from './ManualTools'
import { PositionChip } from './PositionChip'
import { PartWarnings } from './PartWarnings'
import { PreflightPanel } from './PreflightPanel'
import { ProcedureLibrary } from './ProcedureLibrary'
import { NoAcceptedSeams, showsNoAccepted } from './NoAcceptedSeams'
import { revealScrollTop, ROW_HEIGHT, rowWindow } from './rowWindow'
import { acceptAllState, filterRows, ROW_FILTERS, seamRows, type RowFilter } from './seamRows'
import { SequencePanel } from './SequencePanel'
import { noSeamsMessage } from './seamText'
import { TypeMenu } from './TypeMenu'
import { wpsCode } from './wpsCode'

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

// Len fits 9999.9 and WPS a ten letter code in tabular figures; Pos and Acc fit their chips, the label takes the rest.
const GRID = 'grid grid-cols-[20px_minmax(0,1fr)_46px_50px_80px_26px_32px_16px] items-center gap-x-1.5 px-3'

const STATUS_DOT = {
  accepted: 'bg-seam-accepted',
  candidate: 'bg-seam-candidate',
  rejected: 'bg-err',
} as const

const NO_WPS = 'WPS not set'

// Ctrl or Cmd click toggles one seam, Shift click selects the range up to it.
function selectMode(e: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): SelectMode {
  return e.ctrlKey || e.metaKey ? 'toggle' : e.shiftKey ? 'range' : 'replace'
}

function EmptyMessage({ partLoaded, busy }: { partLoaded: boolean; busy: boolean }) {
  const hiddenCorners = useStore((s) => s.seams.reduce((n, seam) => n + (seam.hidden ? 1 : 0), 0))
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
  return <p>{noSeamsMessage(hiddenCorners)}</p>
}

function AcceptAll() {
  const [threshold, setThreshold] = useState(0.7)
  const acceptAbove = useStore((s) => s.acceptAbove)
  const seams = useVisibleSeams()
  const statusById = useStore((s) => s.statusById)
  const state = acceptAllState(seams, statusById, threshold)
  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-line px-3 py-2">
      <Button disabled={state.disabled} title={state.reason ?? undefined} onClick={() => acceptAbove(threshold)} className="w-full">
        {state.label}
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

function SeamTable({ filters }: { filters: ReadonlySet<RowFilter> }) {
  const seams = useVisibleSeams()
  const statusById = useStore((s) => s.statusById)
  const typeById = useStore((s) => s.typeById)
  const selectedId = useStore((s) => s.selectedId)
  const selectedIds = useStore((s) => s.selectedIds)
  const procedureById = useStore((s) => s.procedureById)
  const procedures = useStore((s) => s.procedures)
  const procedureNames = useMemo(() => new Map(procedures.map((p) => [p.id, p.name])), [procedures])
  const hoverId = useStore((s) => s.hoverId)
  const partLoaded = useStore((s) => s.part !== null)
  const busy = useStore((s) => s.detectBusy)
  const select = useStore((s) => s.select)
  const hover = useStore((s) => s.hover)
  const toggleAccepted = useStore((s) => s.toggleAccepted)
  const positionsById = useStore((s) => s.positionsById)
  const gravity = useStore((s) => s.gravity)
  const order = useStore((s) => s.order)
  const accessById = useStore((s) => s.accessById)
  const accessPointsById = useStore((s) => s.accessPointsById)
  const accessBusy = useStore((s) => s.accessBusy)
  const reachById = useStore((s) => s.reachById)
  const reachPointsById = useStore((s) => s.reachPointsById)
  const reachKeyById = useStore((s) => s.reachKeyById)
  const ports = useStore((s) => s.ports)
  const arm = useStore((s) => s.arm)
  const allRows = useMemo(
    () =>
      seamRows(
        seams,
        statusById,
        typeById,
        (seam) => positionFor({ positionsById, gravity, order }, seam),
        procedureById,
        (seam) => accessFor({ accessById, accessPointsById }, seam),
        accessBusy,
        (seam) => reachFor({ reachById, reachPointsById, reachKeyById, ports, arm }, seam),
      ),
    [seams, statusById, typeById, positionsById, gravity, order, procedureById, accessById, accessPointsById, accessBusy, reachById, reachPointsById, reachKeyById, ports, arm],
  )
  const rows = useMemo(() => filterRows(allRows, filters), [allRows, filters])
  const body = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const slice = rowWindow({ count: rows.length, scrollTop, viewportHeight, rowHeight: ROW_HEIGHT })
  const empty = rows.length === 0

  // The box is measured so that a long list draws only the rows that fit it.
  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    setViewportHeight(el.clientHeight)
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [empty])

  // A seam picked in the viewport may be a row that is scrolled out of sight. A windowed list may not have drawn it, so
  // its place is worked out from the row height instead of asking the page.
  useEffect(() => {
    const el = body.current
    if (selectedId === null || !el) return
    if (!slice.windowed) {
      el.querySelector(`[data-seam-id="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: 'nearest' })
      return
    }
    const index = rows.findIndex((row) => row.id === selectedId)
    if (index === -1) return
    const to = revealScrollTop({ index, scrollTop: el.scrollTop, viewportHeight: el.clientHeight, rowHeight: ROW_HEIGHT })
    if (to !== null) el.scrollTop = to
    // Only a change of the selected seam moves the table; scrolling and filtering must not pull it back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  return (
    <div role="table" aria-label="Seams" aria-rowcount={slice.windowed ? rows.length + 1 : undefined} className="flex min-h-0 flex-1 flex-col">
      <div role="row" className={`${GRID} h-7 shrink-0 border-b border-line text-[11px] text-ink-2`}>
        {COLUMNS.map((c) => (
          <span key={c.key} role="columnheader" title={c.title} className="truncate">
            {c.label}
          </span>
        ))}
      </div>
      {rows.length === 0 ? (
        <div className="grid flex-1 place-items-center px-6 text-center text-ink-2">
          {allRows.length > 0 ? (
            <p>No seam matches the chips that are on. Switch a chip off to see more of the {allRows.length} seams.</p>
          ) : (
            <EmptyMessage partLoaded={partLoaded} busy={busy} />
          )}
        </div>
      ) : (
        <div ref={body} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="min-h-0 flex-1 overflow-y-auto">
          {slice.windowed && <div aria-hidden style={{ height: slice.before }} />}
          {rows.slice(slice.start, slice.end).map((row, i) => (
            <div
              key={row.id}
              role="row"
              aria-rowindex={slice.windowed ? slice.start + i + 2 : undefined}
              tabIndex={0}
              aria-selected={selectedIds.includes(row.id)}
              data-seam-id={row.id}
              data-status={row.status}
              onClick={(e) => select(row.id, selectMode(e))}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  select(row.id, selectMode(e))
                }
              }}
              onMouseEnter={() => hover(row.id)}
              onMouseLeave={() => hover(null)}
              className={`${GRID} h-7 cursor-pointer select-none border-b border-line/50 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand ${
                selectedId === row.id
                  ? 'bg-brand/25 text-ink-0'
                  : selectedIds.includes(row.id)
                    ? 'bg-brand/15 text-ink-0'
                    : hoverId === row.id
                      ? 'bg-surface-2 text-ink-1'
                      : 'text-ink-1'
              }`}
            >
              <span role="cell" className={`num ${selectedIds.includes(row.id) ? 'text-ink-1' : 'text-ink-2'}`}>
                {row.n}
              </span>
              <span role="cell" className="truncate text-ink-0">
                {row.label}
              </span>
              <span role="cell" className="min-w-0">
                <TypeMenu row={row} />
              </span>
              <span role="cell" className="num text-right">
                {row.length}
              </span>
              <span role="cell" aria-label={row.wps} className={`truncate ${row.wps === NO_WPS ? 'text-ink-2' : 'text-ink-0'}`}>
                {row.wps === NO_WPS ? (
                  '-'
                ) : (
                  <Tooltip content={procedureNames.get(row.wps) ?? row.wps}>
                    <span>{wpsCode({ id: row.wps })}</span>
                  </Tooltip>
                )}
              </span>
              <span role="cell" aria-label={row.position ? `Position ${row.pos}` : 'Position not set'}>
                <PositionChip position={row.position} />
              </span>
              <span role="cell">
                <AccessChip cls={row.accClass} pending={row.accPending} title={row.accTitle} />
              </span>
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
          {slice.windowed && <div aria-hidden style={{ height: slice.after }} />}
        </div>
      )}
    </div>
  )
}

function toggled(filters: ReadonlySet<RowFilter>, id: RowFilter): ReadonlySet<RowFilter> {
  const next = new Set(filters)
  if (!next.delete(id)) next.add(id)
  return next
}

export function SeamPanel() {
  const [filters, setFilters] = useState<ReadonlySet<RowFilter>>(new Set())
  const procedureStep = useStore((s) => s.activeStep === 'procedures')
  const exportStep = useStore((s) => s.activeStep === 'export')
  const sequenceStep = useStore((s) => s.activeStep === 'sequence')
  const accessStep = useStore((s) => s.activeStep === 'access')
  const activeStep = useStore((s) => s.activeStep)
  const empty = useStore((s) => showsNoAccepted(s.activeStep, selectPlan(s).seams.length))
  return (
    <aside aria-label="Seam list" className="flex min-h-0 w-[376px] shrink-0 flex-col border-r border-line bg-surface-1">
      <Tabs defaultValue="seams" className="flex min-h-0 flex-1 flex-col">
        <TabList label="Left panel">
          <Tab value="seams">Seams</Tab>
          <Tab value="detection">Detection</Tab>
        </TabList>
        <TabPanel value="seams" className="data-[state=active]:flex data-[state=active]:flex-col">
          <PanelHeading step={activeStep} />
          {showsSeamTable(activeStep) && (
            <div className="flex shrink-0 gap-1.5 border-b border-line px-3 py-2">
              {ROW_FILTERS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  aria-pressed={filters.has(chip.id)}
                  onClick={() => setFilters(toggled(filters, chip.id))}
                  className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2 outline-none hover:text-ink-0 focus-visible:ring-1 focus-visible:ring-brand aria-pressed:border-brand aria-pressed:text-ink-0"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          )}
          <PartWarnings />
          {empty && <NoAcceptedSeams />}
          {exportStep ? (
            <PreflightPanel />
          ) : sequenceStep ? (
            <SequencePanel />
          ) : (
            <>
              {procedureStep ? (
                <ProcedureLibrary />
              ) : accessStep ? (
                <AccessPanel />
              ) : (
                <>
                  <ManualTools />
                  <AcceptAll />
                </>
              )}
              <SeamTable filters={filters} />
            </>
          )}
        </TabPanel>
        <TabPanel value="detection">
          <DetectionSettings />
        </TabPanel>
      </Tabs>
    </aside>
  )
}
