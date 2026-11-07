import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { SequenceStrategy } from '../../core/sequence/types'
import { runOptimise } from '../../state/sequenceFlow'
import { selectPlan, selectSequenceOrder } from '../../state/selectors'
import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { getGeometryClient } from '../../worker/client'
import { Button } from '../kit/Button'
import { cleaningField, cycleField } from '../shell/summary'
import { NumberField } from '../kit/NumberField'
import { cleaningEveryText, parseCleaningEvery, parseCleaningTime } from './cleaningFields'
import { NO_ACCEPTED_TEXT } from './NoAcceptedSeams'
import { revealScrollTop, ROW_HEIGHT, rowWindow, windowParts } from './rowWindow'
import { sequenceRows, type SequenceRow } from './sequenceRows'

type Choice = Exclude<SequenceStrategy, 'manual'>

const CHOICES: { value: Choice; label: string }[] = [
  { value: 'table-order', label: 'Table order' },
  { value: 'min-air-move', label: 'Minimum air travel' },
  { value: 'balanced-heat', label: 'Balanced heat' },
]

const STRATEGY_NAMES: Record<SequenceStrategy, string> = {
  'table-order': 'table order',
  'min-air-move': 'minimum air travel',
  'balanced-heat': 'balanced heat',
  manual: 'set by hand',
}


const GRID = 'grid grid-cols-[18px_24px_minmax(0,1fr)_52px_82px_24px] items-center gap-x-1.5 px-3'

function Grip() {
  return (
    <svg aria-hidden viewBox="0 0 8 12" className="size-3 fill-current">
      <circle cx="2" cy="2" r="1" />
      <circle cx="6" cy="2" r="1" />
      <circle cx="2" cy="6" r="1" />
      <circle cx="6" cy="6" r="1" />
      <circle cx="2" cy="10" r="1" />
      <circle cx="6" cy="10" r="1" />
    </svg>
  )
}

function Padlock({ locked }: { locked: boolean }) {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3.5 fill-none stroke-current" strokeWidth="1.2">
      <rect x="2.5" y="5.5" width="7" height="5" rx="1" className={locked ? 'fill-current' : ''} />
      <path d={locked ? 'M4 5.5V4a2 2 0 0 1 4 0v1.5' : 'M4 5.5V4a2 2 0 0 1 3.7-1'} />
    </svg>
  )
}

// The cleaning term of the cycle time: a stop of some seconds each time a stretch of arc time has passed.
function CleaningFields() {
  const everyS = useStore((s) => s.jobSettings.cleanEveryS)
  const timeS = useStore((s) => s.jobSettings.cleanTimeS)
  const setCleaning = useStore((s) => s.setCleaning)
  return (
    <fieldset aria-label="Torch cleaning" className="flex flex-col gap-1">
      <NumberField
        label="Clean the torch every"
        unit="min"
        value={cleaningEveryText(everyS)}
        hint={<span className="pl-0 text-[11px] text-ink-2">Minutes of arc time between cleanings; 0 for none.</span>}
        onCommit={(text) => {
          const parsed = parseCleaningEvery(text)
          return 'error' in parsed ? parsed.error : setCleaning({ cleanEveryS: parsed.seconds })
        }}
      />
      <NumberField
        label="Cleaning stop"
        unit="s"
        value={String(Number(timeS.toFixed(1)))}
        onCommit={(text) => {
          const parsed = parseCleaningTime(text)
          return 'error' in parsed ? parsed.error : setCleaning({ cleanTimeS: parsed.seconds })
        }}
      />
    </fieldset>
  )
}

function Controls() {
  const [choice, setChoice] = useState<Choice>('min-air-move')
  const [busy, setBusy] = useState(false)
  // The share of the search done, as the worker reports it; null before the first report.
  const [progress, setProgress] = useState<number | null>(null)
  const accepted = useStore((s) => selectPlan(s).seams.length)
  const used = useStore((s) => s.strategy)
  const setNotice = useStore((s) => s.setNotice)
  const reason = accepted === 0 ? NO_ACCEPTED_TEXT : null

  const run = async () => {
    setBusy(true)
    setProgress(null)
    try {
      const problem = await runOptimise(getGeometryClient(), choice, setProgress)
      setNotice(problem)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-line px-3 py-2">
      <label className="flex items-center gap-2">
        <span className="text-ink-2">Strategy</span>
        <select
          aria-label="Sequence strategy"
          value={choice}
          onChange={(e) => setChoice(e.target.value as Choice)}
          className="h-7 min-w-0 flex-1 rounded-sm border border-line bg-surface-2 px-2 text-ink-0 outline-none focus-visible:ring-1 focus-visible:ring-brand"
        >
          {CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <Button disabled={reason !== null || busy} title={reason ?? undefined} onClick={() => void run()} className="w-full">
        {busy ? (progress === null ? 'Optimising' : `Optimising ${Math.round(progress * 100)}%`) : 'Optimise'}
      </Button>
      {busy && progress !== null && (
        <div
          role="progressbar"
          aria-label="Optimising the sequence"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="h-1 bg-surface-2"
        >
          <div className="h-full bg-brand" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
      {reason === null && <p className="text-ink-2">Current order: {STRATEGY_NAMES[used]}. Drag a row, or press Alt and an arrow key, to set it by hand.</p>}
      <CleaningFields />
      <Summary />
    </div>
  )
}

function Summary() {
  const timing = useStore((s) => s.timing)
  const current = useStore((s) => s.timingFor === selectPlan(s))
  if (!timing || timing.seams.length === 0) return null
  const air = timing.moves.reduce((total, m) => total + m.lengthMm, 0)
  const field = cycleField(timing, current)
  const cleaning = cleaningField(timing)
  return (
    <dl className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 ${field.stale ? 'opacity-60' : ''}`}>
      <dt className="text-ink-2">Air travel</dt>
      <dd className="num text-ink-0">{Math.round(air).toLocaleString('en-US')} mm</dd>
      {cleaning && (
        <>
          <dt className="text-ink-2">Torch cleaning</dt>
          <dd className="num text-ink-0">{cleaning}</dd>
        </>
      )}
      <dt className="text-ink-2">Cycle time</dt>
      <dd className="num text-ink-0">{field.value}</dd>
    </dl>
  )
}

function SequenceList() {
  const order = useStore(selectSequenceOrder)
  const seams = useVisibleSeams()
  const selectedId = useStore((s) => s.selectedId)
  const selectedIds = useStore((s) => s.selectedIds)
  const hoverId = useStore((s) => s.hoverId)
  const select = useStore((s) => s.select)
  const hover = useStore((s) => s.hover)
  const reorder = useStore((s) => s.reorder)
  const toggleLock = useStore((s) => s.toggleLock)
  const setNotice = useStore((s) => s.setNotice)
  const rows = useMemo(() => sequenceRows(order, new Map(seams.map((s) => [s.id, s]))), [order, seams])
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  // A row moved with Alt and an arrow, which takes the focus once it is drawn.
  const [refocus, setRefocus] = useState<string | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(0)
  const slice = rowWindow({ count: rows.length, scrollTop, viewportHeight, rowHeight: ROW_HEIGHT })
  const refocusIndex = refocus === null ? -1 : rows.findIndex((row) => row.id === refocus)
  // The dragged row stays drawn while the list scrolls under the drag, or the browser would end the drag.
  const parts = windowParts(slice, [dragFrom ?? -1, refocusIndex], rows.length, ROW_HEIGHT)
  const empty = rows.length === 0

  useLayoutEffect(() => {
    const el = body.current
    if (!el) return
    setViewportHeight(el.clientHeight)
    const observer = new ResizeObserver(() => setViewportHeight(el.clientHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [empty])

  // A row moved with the keyboard keeps the focus, which the browser may drop when it moves the element. In a long
  // list the row may have moved past the edge of the box, so the list is scrolled to it first.
  useEffect(() => {
    const el = body.current
    if (refocus === null || !el) return
    if (refocusIndex !== -1) {
      const to = revealScrollTop({ index: refocusIndex, scrollTop: el.scrollTop, viewportHeight: el.clientHeight, rowHeight: ROW_HEIGHT })
      if (to !== null) {
        el.scrollTop = to
        // The scroll event comes a frame later; the window follows now, before the row is let go.
        setScrollTop(el.scrollTop)
      }
    }
    el.querySelector<HTMLElement>(`[data-seam-id="${CSS.escape(refocus)}"]`)?.focus({ preventScroll: true })
    setRefocus(null)
  }, [refocus, refocusIndex])

  const move = (from: number, to: number) => {
    setNotice(reorder(from, to))
  }

  const renderRow = (row: SequenceRow, i: number) => (
      <div
        key={row.id}
        role="row"
        aria-rowindex={slice.windowed ? i + 2 : undefined}
        tabIndex={0}
        draggable={!row.locked}
        aria-selected={selectedIds.includes(row.id)}
        data-seam-id={row.id}
        data-locked={row.locked}
        onClick={(e) => select(row.id, e.ctrlKey || e.metaKey ? 'toggle' : e.shiftKey ? 'range' : 'replace')}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault()
            setRefocus(row.id)
            move(i, e.key === 'ArrowUp' ? i - 1 : i + 1)
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            select(row.id)
          }
        }}
        onDragStart={(e) => {
          setDragFrom(i)
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', row.id)
        }}
        onDragOver={(e) => {
          if (dragFrom === null) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setOver(i)
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (dragFrom !== null && dragFrom !== i) move(dragFrom, i)
          setDragFrom(null)
          setOver(null)
        }}
        onDragEnd={() => {
          setDragFrom(null)
          setOver(null)
        }}
        onMouseEnter={() => hover(row.id)}
        onMouseLeave={() => hover(null)}
        className={`${GRID} h-7 select-none border-b border-line/50 outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand ${
          over === i && dragFrom !== null && dragFrom !== i ? 'border-t-2 border-t-brand' : ''
        } ${row.locked ? 'cursor-pointer' : 'cursor-grab'} ${
          selectedId === row.id ? 'bg-brand/25 text-ink-0' : selectedIds.includes(row.id) ? 'bg-brand/15 text-ink-0' : hoverId === row.id ? 'bg-surface-2 text-ink-1' : 'text-ink-1'
        }`}
      >
        <span role="cell" aria-hidden className={row.locked ? 'text-ink-2/40' : 'text-ink-2'} title={row.locked ? 'Locked seams cannot be dragged' : 'Drag to reorder'}>
          <Grip />
        </span>
        <span role="cell" className="num text-ink-0">
          {row.n}
        </span>
        <span role="cell" className="truncate text-ink-0">
          {row.label}
        </span>
        <span role="cell" className="num text-right">
          {row.length}
        </span>
        <span role="cell" className="truncate">
          {row.direction}
        </span>
        <span role="cell">
          <button
            type="button"
            aria-label={`${row.locked ? 'Unlock' : 'Lock'} seam ${row.label}`}
            aria-pressed={row.locked}
            title={row.locked ? 'Locked: keeps its place when you optimise' : 'Lock this seam in its place'}
            onClick={(e) => {
              e.stopPropagation()
              toggleLock(row.id)
            }}
            className={`grid size-5 place-items-center rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-brand ${row.locked ? 'text-brand' : 'text-ink-2 hover:text-ink-0'}`}
          >
            <Padlock locked={row.locked} />
          </button>
        </span>
      </div>
  )

  if (rows.length === 0) {
    // The no accepted seams message and its button sit above the panel, in SeamPanel.
    return <div className="flex-1" />
  }

  return (
    <div role="table" aria-label="Sequence" aria-rowcount={slice.windowed ? rows.length + 1 : undefined} className="flex min-h-0 flex-1 flex-col">
      <div role="row" className={`${GRID} h-7 shrink-0 border-b border-line text-[11px] text-ink-2`}>
        <span role="columnheader" aria-label="Drag handle" />
        <span role="columnheader" title="Place in the sequence">
          #
        </span>
        <span role="columnheader">Label</span>
        <span role="columnheader" title="Length in millimetres">
          Len
        </span>
        <span role="columnheader" title="Which way the torch travels">
          Direction
        </span>
        <span role="columnheader" aria-label="Lock" />
      </div>
      <div ref={body} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="min-h-0 flex-1 overflow-y-auto">
        {/* One flat list, so a row keeps its element (and the focus) when a spacer appears above it. */}
        {parts.flatMap((part, k) =>
          'gap' in part
            ? [<div key={`gap-${k}`} aria-hidden style={{ height: part.gap }} />]
            : rows.slice(part.start, part.end).map((row, j) => renderRow(row, part.start + j)),
        )}
      </div>
    </div>
  )
}

// Step 4: the accepted seams in the order they will be welded, with the strategy and the Optimise button above them.
export function SequencePanel() {
  return (
    <>
      <Controls />
      <SequenceList />
    </>
  )
}
