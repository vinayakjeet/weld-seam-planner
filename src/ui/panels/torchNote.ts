import { DISPLAY_CTWD_MM } from '../viewport/torchModel'

// How near to 1 the scale has to be for the torch to count as drawn to scale.
const TRUE_SIZE_BAND = 0.05

const mm = (value: number) => `${Number(value.toFixed(1))} mm`

// What the Torch section says about how the preview is drawn: its size against the real torch and where its distance comes from.
export function torchNote(scale: number, ctwdMm: number | null | undefined): string {
  const size =
    Math.abs(scale - 1) <= TRUE_SIZE_BAND
      ? 'The torch is drawn to scale.'
      : `The torch is drawn ${Number(scale.toFixed(1))} times its real size so that it ${scale > 1 ? 'shows on' : 'fits'} this part.`
  if (ctwdMm === null || ctwdMm === undefined) return `${size} The procedure has no contact tip distance, so ${mm(DISPLAY_CTWD_MM)} is drawn.`
  const scaled = Math.abs(scale - 1) <= TRUE_SIZE_BAND ? '' : ' and is scaled the same'
  return `${size} The contact tip distance, ${mm(ctwdMm)}, comes from the procedure${scaled}.`
}
