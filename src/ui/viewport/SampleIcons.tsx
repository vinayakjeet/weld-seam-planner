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

export function FlippedNormalsIcon() {
  return (
    <Frame>
      <rect x="8" y="40" width="34" height="5" />
      <rect x="22" y="22" width="6" height="18" />
      <rect x="54" y="40" width="34" height="5" />
      <rect x="68" y="22" width="6" height="18" />
      <path d="M24 16v-6M21 13l3-3 3 3M70 10v6M67 13l3 3 3-3" />
      <Bead x={22} y={40} dx={-1} dy={-1} size={6} />
      <Bead x={68} y={40} dx={-1} dy={-1} size={6} />
    </Frame>
  )
}

export function BarThroughPlateIcon() {
  return (
    <Frame>
      <rect x="14" y="8" width="68" height="48" />
      <circle cx="48" cy="32" r="10" />
      <circle cx="48" cy="32" r="13" stroke="var(--seam-accepted)" strokeWidth="2.5" />
      <path d="M38 32h20M48 22v20" />
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

export function TankWithManholeIcon() {
  return (
    <Frame>
      <rect x="10" y="14" width="76" height="38" />
      <rect x="14" y="18" width="68" height="30" />
      <line x1="46" y1="38" x2="46" y2="48" />
      <line x1="62" y1="38" x2="62" y2="48" />
      <rect x="22" y="9" width="14" height="5" />
      <Bead x={46} y={48} dx={-1} dy={-1} size={5} />
      <Bead x={62} y={48} dx={1} dy={-1} size={5} />
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
  ['bar-through-plate', BarThroughPlateIcon],
  ['flipped-normals', FlippedNormalsIcon],
  ['double-bottom-cell', DoubleBottomCellIcon],
  ['tank-with-manhole', TankWithManholeIcon],
]

export function iconForSample(id: string): ComponentType {
  return ICONS_BY_PREFIX.find(([prefix]) => id.startsWith(prefix))?.[1] ?? GenericPartIcon
}
