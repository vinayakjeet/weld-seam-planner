export const PROCESSES = ['GMAW', 'FCAW', 'GTAW', 'SAW'] as const
export type Process = (typeof PROCESSES)[number]

export interface Check {
  level: 'ok' | 'amber' | 'red'
  // Empty when the level is ok.
  reason: string
}

// Heat input factors from ISO/TR 18491 and EN 1011-1.
const EFFICIENCY: Record<Process, number> = { SAW: 1.0, GMAW: 0.8, FCAW: 0.8, GTAW: 0.6 }

export const HEAT_INPUT_LIMITS = {
  amberAboveKJmm: 2.5,
  redAboveKJmm: 3.5,
  lowBelowKJmm: 0.4,
  lowAppliesFromThickerMm: 6,
} as const

export function thermalEfficiency(process: Process): number {
  return EFFICIENCY[process]
}

const positive = (x: number) => Number.isFinite(x) && x > 0

// kJ/mm before the thermal efficiency factor; travel is in mm/min.
export function arcEnergyKJmm(voltageV: number, currentA: number, travelMmMin: number): number | null {
  if (!positive(voltageV) || !positive(currentA) || !positive(travelMmMin)) return null
  return (voltageV * currentA * 60) / (1000 * travelMmMin)
}

export function heatInputKJmm(k: number, voltageV: number, currentA: number, travelMmMin: number): number | null {
  const e = arcEnergyKJmm(voltageV, currentA, travelMmMin)
  if (e === null || !positive(k)) return null
  return k * e
}

export function heatInputCheck(q: number | null, thickerMm: number | null): Check {
  if (q === null || !Number.isFinite(q)) {
    return { level: 'red', reason: 'Heat input cannot be worked out because voltage, current or travel speed is not above 0.' }
  }
  const L = HEAT_INPUT_LIMITS
  if (q > L.redAboveKJmm) {
    return { level: 'red', reason: `Heat input is ${q.toFixed(2)} kJ/mm, above ${L.redAboveKJmm} kJ/mm, which risks a coarse, brittle heat affected zone.` }
  }
  if (q > L.amberAboveKJmm) {
    return { level: 'amber', reason: `Heat input is ${q.toFixed(2)} kJ/mm, above ${L.amberAboveKJmm} kJ/mm, which can soften the heat affected zone.` }
  }
  if (q < L.lowBelowKJmm && thickerMm !== null && thickerMm >= L.lowAppliesFromThickerMm) {
    return { level: 'amber', reason: `Heat input is ${q.toFixed(2)} kJ/mm, below ${L.lowBelowKJmm} kJ/mm on a ${thickerMm} mm part, which risks lack of fusion.` }
  }
  return { level: 'ok', reason: '' }
}
