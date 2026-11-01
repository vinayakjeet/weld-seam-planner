import type { ComponentType, ReactNode } from 'react'

// Part outlines are neutral; the weld bead is the only brand-coloured mark,
// the same rule the viewport uses for accepted seams.
function Bead({ x, y, dx, dy, size = 8 }: { x: number; y: number; dx: 1 | -1; dy: 1 | -1; size?: number }) {
  return <polygon points={`${x},${y} ${x + dx * size},${y} ${x},${y + dy * size}`} fill="var(--seam-accepted)" />
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 96 64" aria-hidden className="h-16 w-24" fill="none" stroke="currentColor" strokeWidth="1.5">
      {children}
    </svg>
  )
}

export function TJointIcon() {
  return (
    <Frame>
      <rect x="12" y="40" width="72" height="6" />
      <rect x="44" y="12" width="8" height="28" />
      <Bead x={44} y={40} dx={-1} dy={-1} />
      <Bead x={52} y={40} dx={1} dy={-1} />
    </Frame>
  )
}

export function LBracketIcon() {
  return (
    <Frame>
      <rect x="20" y="10" width="7" height="44" />
      <rect x="27" y="47" width="50" height="7" />
      <Bead x={27} y={47} dx={1} dy={-1} size={10} />
    </Frame>
  )
}

export function BoxBeamIcon() {
  return (
    <Frame>
      <rect x="26" y="12" width="44" height="40" />
      <rect x="31" y="17" width="34" height="30" />
      {[
        [26, 12],
        [70, 12],
        [26, 52],
        [70, 52],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3" fill="var(--seam-accepted)" stroke="none" />
      ))}
    </Frame>
  )
}

export function PipeOnPlateIcon() {
  return (
    <Frame>
      <rect x="14" y="8" width="68" height="48" />
      <circle cx="48" cy="32" r="12" />
      <circle cx="48" cy="32" r="8" />
      <circle cx="48" cy="32" r="15" stroke="var(--seam-accepted)" strokeWidth="2.5" />
    </Frame>
  )
}

export function DoubleBottomCellIcon() {
  return (
    <Frame>
      <rect x="10" y="12" width="76" height="5" />
      <rect x="10" y="44" width="76" height="5" />
      <rect x="30" y="17" width="4" height="27" />
      <rect x="62" y="17" width="4" height="27" />
      {[30, 62].flatMap((x) => [
        <Bead key={`bl-${x}`} x={x} y={44} dx={-1} dy={-1} size={5} />,
        <Bead key={`br-${x}`} x={x + 4} y={44} dx={1} dy={-1} size={5} />,
        <Bead key={`tl-${x}`} x={x} y={17} dx={-1} dy={1} size={5} />,
        <Bead key={`tr-${x}`} x={x + 4} y={17} dx={1} dy={1} size={5} />,
      ])}
    </Frame>
  )
}

export function GenericPartIcon() {
  return (
    <Frame>
      <rect x="14" y="14" width="68" height="36" />
      <Bead x={14} y={50} dx={1} dy={-1} size={10} />
    </Frame>
  )
}

// Matched by id prefix so variants of one part (merged, assembly, inch, ascii) share an icon.
const ICONS_BY_PREFIX: [string, ComponentType][] = [
  ['t-joint', TJointIcon],
  ['l-bracket', LBracketIcon],
  ['box-beam', BoxBeamIcon],
  ['pipe-on-plate', PipeOnPlateIcon],
  ['double-bottom-cell', DoubleBottomCellIcon],
]

export function iconForSample(id: string): ComponentType {
  return ICONS_BY_PREFIX.find(([prefix]) => id.startsWith(prefix))?.[1] ?? GenericPartIcon
}
