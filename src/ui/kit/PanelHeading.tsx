import { STEP_PANEL_HEADING } from '../panels/panelHeadings'
import type { StepId } from '../../state/store'

export function PanelHeading({ step }: { step: StepId }) {
  return <h2 className="font-display shrink-0 border-b border-line px-3 py-2 text-lg leading-none text-ink-0">{STEP_PANEL_HEADING[step]}</h2>
}
