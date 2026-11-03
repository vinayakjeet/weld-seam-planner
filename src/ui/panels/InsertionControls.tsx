import { useEffect } from 'react'
import { insertSelected } from '../../state/reachFlow'
import { reachFor } from '../../state/reachSlice'
import { useStore } from '../../state/store'
import { useVisibleSeams } from '../../state/useVisibleSeams'
import { getGeometryClient } from '../../worker/client'
import { Button } from '../kit/Button'

export const FRAMES_PER_S = 30

// Steps the insertion frame by frame while it plays, and stops at the last frame.
function useInsertionClock(): void {
  const playing = useStore((s) => s.insertionState?.playing === true)
  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      const { insertionState, setInsertionFrame, setInsertionPlaying } = useStore.getState()
      if (!insertionState) return
      if (insertionState.frame >= insertionState.frames.length - 1) setInsertionPlaying(false)
      else setInsertionFrame(insertionState.frame + 1)
    }, 1000 / FRAMES_PER_S)
    return () => clearInterval(timer)
  }, [playing])
}

// Insert, Play and Pause and a frame slider for the arm entering the selected seam through its port.
export function InsertionControls() {
  useInsertionClock()
  const selectedId = useStore((s) => s.selectedId)
  const insertion = useStore((s) => s.insertionState)
  const setFrame = useStore((s) => s.setInsertionFrame)
  const setPlaying = useStore((s) => s.setInsertionPlaying)
  const reachById = useStore((s) => s.reachById)
  const reachPointsById = useStore((s) => s.reachPointsById)
  const reachKeyById = useStore((s) => s.reachKeyById)
  const ports = useStore((s) => s.ports)
  const arm = useStore((s) => s.arm)
  const seam = useVisibleSeams().find((s) => s.id === selectedId)
  const reach = seam ? reachFor({ reachById, reachPointsById, reachKeyById, ports, arm }, seam) : null
  const shown = insertion !== null && insertion.seamId === selectedId ? insertion : null
  const last = shown ? shown.frames.length - 1 : 0

  return (
    <section aria-label="Insertion" className="flex flex-col gap-2 border-b border-line px-3 py-3">
      <h3 className="text-xs font-semibold text-ink-0">Arm insertion</h3>
      {!seam ? (
        <p className="text-ink-2">Select a snake seam to see the arm at the scrub position and to play its insertion.</p>
      ) : reach === null ? (
        <p className="text-ink-2">This seam has no current reach result. Run reach first.</p>
      ) : (
        <>
          <p className="text-ink-2">The arm is drawn at the scrub position of the selected seam. Insert plays it in from the port.</p>
          <div className="flex items-center gap-2">
            <Button onClick={() => void insertSelected(getGeometryClient())}>Insert</Button>
            <Button disabled={shown === null} onClick={() => setPlaying(!shown?.playing)}>
              {shown?.playing ? 'Pause' : 'Play'}
            </Button>
          </div>
          <label className="flex items-center gap-2 text-ink-1">
            <span className="w-24 shrink-0">Insertion frame</span>
            <input
              type="range"
              min={0}
              max={Math.max(1, last)}
              step={1}
              disabled={shown === null}
              value={shown?.frame ?? 0}
              aria-label="Insertion frame"
              onChange={(e) => {
                setPlaying(false)
                setFrame(Number(e.target.value))
              }}
              className="min-w-0 flex-1 accent-brand"
            />
            <span className="num w-16 shrink-0 text-right text-ink-0">{shown ? `${shown.frame + 1} / ${shown.frames.length}` : '-'}</span>
          </label>
        </>
      )}
    </section>
  )
}
