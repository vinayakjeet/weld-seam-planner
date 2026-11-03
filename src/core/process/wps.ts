import type { Procedure, ProcedureOverrides } from '../job/schema'
import { thermalEfficiency } from './heatInput'

const GAS_82_18 = 'Ar 82 / CO2 18'

const noWeave = { pattern: 'none', amplitudeMm: 0, frequencyHz: 0, dwellMs: 0 } as const

// Starting points for mild and structural steel, not qualified procedures.
export const WPS_PRESETS: readonly Procedure[] = [
  {
    id: 'WPS-GMAW-SC',
    name: 'GMAW short-circuit, sheet up to 4 mm',
    process: 'GMAW',
    transfer: 'short-circuit',
    baseMaterial: { spec: 'S235', thicknessMm: [1, 4] },
    wire: { classification: 'ER70S-6', diameterMm: 0.9 },
    gas: { mix: GAS_82_18, flowLpm: 15 },
    electrical: { currentA: 135, voltageV: 18.5, wireFeedMpm: 6, polarity: 'DCEP' },
    travelSpeedMmS: 6.5,
    ctwdMm: 12,
    torch: { workAngleOffsetDeg: 0, travelAngleDeg: 10, technique: 'push' },
    weave: { ...noWeave },
    arcStart: { preflowS: 0.3 },
    arcEnd: { craterFillS: 0.5, burnbackMs: 80, postflowS: 1.0 },
    positions: ['PA', 'PB', 'PD', 'PF', 'PG'],
    thermalEfficiency: thermalEfficiency('GMAW'),
    preheatC: 20,
    interpassMaxC: 250,
  },
  {
    id: 'WPS-GMAW-SPRAY-FW6',
    name: 'GMAW spray, fillet 6 mm, PA/PB',
    process: 'GMAW',
    transfer: 'spray',
    baseMaterial: { spec: 'S355', thicknessMm: [8, 20] },
    wire: { classification: 'ER70S-6', diameterMm: 1.2 },
    gas: { mix: GAS_82_18, flowLpm: 15 },
    electrical: { currentA: 270, voltageV: 28, wireFeedMpm: 10, polarity: 'DCEP' },
    travelSpeedMmS: 9.0,
    ctwdMm: 18,
    torch: { workAngleOffsetDeg: 0, travelAngleDeg: 10, technique: 'push' },
    weave: { ...noWeave },
    arcStart: { preflowS: 0.3 },
    arcEnd: { craterFillS: 0.5, burnbackMs: 80, postflowS: 1.0 },
    positions: ['PA', 'PB'],
    thermalEfficiency: thermalEfficiency('GMAW'),
    preheatC: 20,
    interpassMaxC: 250,
  },
  {
    id: 'WPS-GMAW-PULSE',
    name: 'GMAW pulse, all positions',
    process: 'GMAW',
    transfer: 'pulse',
    baseMaterial: { spec: 'S355', thicknessMm: [3, 20] },
    wire: { classification: 'ER70S-6', diameterMm: 1.2 },
    gas: { mix: GAS_82_18, flowLpm: 15 },
    // Pulse voltage is a nominal value so heat input can be estimated; the power source is synergic.
    electrical: { currentA: 220, voltageV: 25, wireFeedMpm: 8, polarity: 'DCEP' },
    travelSpeedMmS: 7.0,
    ctwdMm: 16,
    torch: { workAngleOffsetDeg: 0, travelAngleDeg: 8, technique: 'push' },
    weave: { ...noWeave },
    arcStart: { preflowS: 0.3 },
    arcEnd: { craterFillS: 0.5, burnbackMs: 80, postflowS: 1.0 },
    positions: ['PA', 'PB', 'PD', 'PF', 'PG'],
    thermalEfficiency: thermalEfficiency('GMAW'),
    preheatC: 20,
    interpassMaxC: 250,
  },
  {
    id: 'WPS-FCAW-G',
    name: 'FCAW-G rutile, PB and PF fillets',
    process: 'FCAW',
    baseMaterial: { spec: 'S355', thicknessMm: [6, 30] },
    wire: { classification: 'E71T-1C', diameterMm: 1.2 },
    gas: { mix: 'M21', flowLpm: 18 },
    electrical: { currentA: 240, voltageV: 27, wireFeedMpm: 10, polarity: 'DCEP' },
    travelSpeedMmS: 6.5,
    ctwdMm: 20,
    torch: { workAngleOffsetDeg: 0, travelAngleDeg: 8, technique: 'drag' },
    weave: { ...noWeave },
    arcStart: { preflowS: 0.3 },
    arcEnd: { craterFillS: 0.5, burnbackMs: 80, postflowS: 1.0 },
    positions: ['PB', 'PF'],
    thermalEfficiency: thermalEfficiency('FCAW'),
    preheatC: 20,
    interpassMaxC: 250,
  },
  {
    id: 'WPS-GTAW',
    name: 'GTAW, thin stainless',
    process: 'GTAW',
    baseMaterial: { spec: '1.4301', thicknessMm: [0.5, 4] },
    wire: { classification: 'ER308LSi', diameterMm: 1.6 },
    gas: { mix: 'Ar 100', flowLpm: 10 },
    electrical: { currentA: 115, voltageV: 11, polarity: 'DCEN' },
    travelSpeedMmS: 3.0,
    ctwdMm: null,
    torch: { workAngleOffsetDeg: 0, travelAngleDeg: 12, technique: 'push' },
    weave: { ...noWeave },
    arcStart: { preflowS: 0.5 },
    arcEnd: { craterFillS: 0.5, burnbackMs: 0, postflowS: 5.0 },
    positions: ['PA', 'PB', 'PF'],
    thermalEfficiency: thermalEfficiency('GTAW'),
    preheatC: 20,
    interpassMaxC: 150,
  },
]

type Plain = Record<string, unknown>

const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && !Array.isArray(v)

function merge(target: Plain, patch: Plain): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const current = target[key]
    if (isPlain(value) && isPlain(current)) merge(current, value)
    else target[key] = structuredClone(value)
  }
}

export function resolveProcedure(base: Procedure, overrides: ProcedureOverrides): Procedure {
  const out = structuredClone(base) as Plain
  const rest: Plain = { ...(overrides as Plain) }
  delete rest.id
  delete rest.name
  merge(out, rest)
  return out as Procedure
}

function freeId(wanted: string, taken: Set<string>): string {
  if (!taken.has(wanted)) return wanted
  for (let n = 2; ; n++) {
    const candidate = `${wanted}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

export function duplicateProcedure(source: Procedure, takenIds: Iterable<string>): Procedure {
  const copy = structuredClone(source)
  copy.id = freeId(`${source.id}-COPY`, new Set(takenIds))
  copy.name = `${source.name} (copy)`
  return copy
}

export function blankProcedure(takenIds: Iterable<string>): Procedure {
  const spray = WPS_PRESETS.find((p) => p.id === 'WPS-GMAW-SPRAY-FW6')!
  const copy = structuredClone(spray)
  copy.id = freeId('WPS-NEW', new Set(takenIds))
  copy.name = 'New procedure'
  return copy
}

export function proceduresForPosition(procedures: readonly Procedure[], iso: string | null): Procedure[] {
  if (iso === null) return [...procedures]
  const matches = procedures.filter((p) => (p.positions as string[]).includes(iso))
  const rest = procedures.filter((p) => !(p.positions as string[]).includes(iso))
  return [...matches, ...rest]
}
