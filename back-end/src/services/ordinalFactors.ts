import type { DayRecord } from './dayAggregation.js'
import {
  average,
  confidenceLabel,
  MIN_SAMPLE,
  MIN_TOTAL_DAYS,
  TENTATIVE_EXPOSURE,
  type ScoreFinding,
  type ScoreMetric,
} from './correlation.js'

export interface OrdinalFactor {
  name: string
  emoji: string
  tagPrefix: string
  // Ordered low → high; index + 1 is the numeric value stored per day.
  levels: string[]
  badDirection: 'low' | 'high'
}

export const ORDINAL_FACTORS: OrdinalFactor[] = [
  { name: 'Hydration', emoji: '💧', tagPrefix: 'hydration ', levels: ['bad', 'good'], badDirection: 'low' },
  { name: 'Screen time', emoji: '📱', tagPrefix: 'screen time ', levels: ['low', 'medium', 'high'], badDirection: 'high' },
]

function worstIdx(factor: OrdinalFactor): number {
  return factor.badDirection === 'low' ? 0 : factor.levels.length - 1
}

function bestIdx(factor: OrdinalFactor): number {
  return factor.badDirection === 'low' ? factor.levels.length - 1 : 0
}

export interface OrdinalLevelMatch {
  factor: OrdinalFactor
  value: number
  isWorst: boolean
}

// Matches a lowercased tag label like "hydration low" against the configured
// ordinal factors — e.g. { factor: Hydration, value: 1, isWorst: true }.
// Used to keep individual levels out of the binary exposure pool.
export function matchOrdinalLevel(label: string): OrdinalLevelMatch | null {
  for (const factor of ORDINAL_FACTORS) {
    if (!label.startsWith(factor.tagPrefix)) continue
    const levelPart = label.slice(factor.tagPrefix.length)
    const idx = factor.levels.indexOf(levelPart)
    if (idx === -1) continue
    return { factor, value: idx + 1, isWorst: idx === worstIdx(factor) }
  }
  return null
}

function scoreValuesFor(day: DayRecord, metric: ScoreMetric): number[] {
  if (metric === 'mood') return day.moodScores
  if (metric === 'energy') return day.energyScores
  return day.sleepScore != null ? [day.sleepScore] : []
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Numeric ordinal analysis: pools all days at the best level vs all days at
// the worst level (ignoring the middle) and compares mood/energy/sleep
// averages — one finding per factor per metric, instead of each level
// fragmenting into its own binary exposure.
export function computeOrdinalFactorImpacts(days: DayRecord[]): ScoreFinding[] {
  if (days.length < MIN_TOTAL_DAYS) return []

  const findings: ScoreFinding[] = []

  for (const factor of ORDINAL_FACTORS) {
    const best = bestIdx(factor)
    const worst = worstIdx(factor)
    const bestValue = best + 1
    const worstValue = worst + 1

    const bestDays = days.filter((d) => (d.ordinalScores[factor.name] ?? []).includes(bestValue))
    const worstDays = days.filter((d) => (d.ordinalScores[factor.name] ?? []).includes(worstValue))

    for (const metric of ['mood', 'energy', 'sleep'] as const) {
      const bestScores = bestDays.flatMap((d) => scoreValuesFor(d, metric))
      const worstScores = worstDays.flatMap((d) => scoreValuesFor(d, metric))
      if (bestScores.length < MIN_SAMPLE || worstScores.length < MIN_SAMPLE) continue

      const avgWithInput = average(bestScores)!
      const avgWithoutInput = average(worstScores)!
      const diff = avgWithInput - avgWithoutInput
      const n = Math.min(bestScores.length, worstScores.length)
      const bestLabel = cap(factor.levels[best])
      const worstLabel = cap(factor.levels[worst])

      findings.push({
        metric,
        inputLabel: factor.name.toLowerCase(),
        daysWithInput: bestScores.length,
        daysWithoutInput: worstScores.length,
        avgWithInput,
        avgWithoutInput,
        diff,
        tentative: n < TENTATIVE_EXPOSURE,
        summary: `${factor.name} → ${metric}: ${bestLabel} ${avgWithInput.toFixed(1)}/10 (n=${bestScores.length}) vs ${worstLabel} ${avgWithoutInput.toFixed(1)}/10 (n=${worstScores.length}) — ${confidenceLabel(n)}.`,
      })
    }
  }

  return findings
}
