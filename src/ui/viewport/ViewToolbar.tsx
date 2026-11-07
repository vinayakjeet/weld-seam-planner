import { ACCESS_CLASSES, accessLabel } from '../panels/accessText'
import { useStore } from '../../state/store'
import { hiddenLabelsText } from './labelAnchor'

// Over the viewport: the switch between colouring the seams by status and by torch access, with the legend of the
// colours while access is on.
export function ViewToolbar() {
  const colourBy = useStore((s) => s.colourBy)
  const setColourBy = useStore((s) => s.setColourBy)
  const xray = useStore((s) => s.xray)
  const toggleXray = useStore((s) => s.toggleXray)
  const byAccess = colourBy === 'access'
  const hiddenNote = useStore((s) => (s.activeStep === 'sequence' && !s.xray ? hiddenLabelsText(s.hiddenLabels) : null))
  return (
    <div className="absolute bottom-3 left-3 z-10 flex flex-col items-start gap-1.5" role="toolbar" aria-label="View">
      {hiddenNote && (
        <p role="status" className="rounded-sm border border-line bg-surface-1/90 px-2 py-1 text-[11px] text-ink-1">
          {hiddenNote}
        </p>
      )}
      {byAccess && (
        <ul aria-label="Access colours" className="flex gap-3 rounded-sm border border-line bg-surface-1/90 px-2 py-1 text-[11px] text-ink-1">
          {ACCESS_CLASSES.map((cls) => (
            <li key={cls} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: `var(--access-${cls})` }} />
              {accessLabel(cls)}
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
      <button
        type="button"
        aria-pressed={xray}
        onClick={toggleXray}
        title="See through the part to the seams inside it (X)"
        className={`h-7 rounded-sm border px-2.5 text-[11px] font-medium outline-none focus-visible:ring-1 focus-visible:ring-brand ${
          xray ? 'border-brand bg-brand/20 text-ink-0' : 'border-line bg-surface-1/90 text-ink-1 hover:border-ink-2'
        }`}
      >
        X-ray
      </button>
      <button
        type="button"
        aria-pressed={byAccess}
        onClick={() => setColourBy(byAccess ? 'status' : 'access')}
        title="Colour the seams by the torch access class instead of their status"
        className={`h-7 rounded-sm border px-2.5 text-[11px] font-medium outline-none focus-visible:ring-1 focus-visible:ring-brand ${
          byAccess ? 'border-brand bg-brand/20 text-ink-0' : 'border-line bg-surface-1/90 text-ink-1 hover:border-ink-2'
        }`}
      >
        Colour by access
      </button>
      </div>
    </div>
  )
}
