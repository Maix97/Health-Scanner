import { nextDayKey, type CarryoverPeriod, type DayRecord, type PeriodRecord } from './dayAggregation.js'

export const MIN_TOTAL_DAYS = 7
export const MAX_FINDINGS = 8
export const BAD_SLEEP_OUTCOME = 'poor sleep'

// Thresholds scale up as more data accumulates so early findings are shown
// (labelled "tentative") and requirements tighten automatically over time.
export function getThresholds(totalDays: number): { minSample: number; minLift: number; minMoodDiff: number } {
  if (totalDays >= 30) return { minSample: 5, minLift: 0.3, minMoodDiff: 1.5 }
  if (totalDays >= 20) return { minSample: 4, minLift: 0.25, minMoodDiff: 1.2 }
  return { minSample: 3, minLift: 0.2, minMoodDiff: 1.0 }
}

// Keep named exports for backwards compat with tests/other callers
export const MIN_SAMPLE = 3
export const MIN_LIFT = 0.2
export const MIN_MOOD_DIFF = 1.0
// On the 1-5 sleep scale, treat 1-2 as "poor" — same Likert-style bucketing
// as 1-3/4-6/7-10 would suggest, just scaled down for a 5-point range.
const POOR_SLEEP_THRESHOLD = 4

export interface CorrelationFinding {
  inputLabel: string
  outcomeLabel: string
  daysWithInput: number
  daysWithoutInput: number
  rateWithInput: number
  rateWithoutInput: number
  lift: number
  summary: string
  // Disambiguates findings with the same label pair from different period
  // relationships (e.g. morning->day vs morning->evening) for cache keying.
  context?: string
}

function hasOutcome(day: DayRecord, outcomeLabel: string): boolean {
  if (outcomeLabel === BAD_SLEEP_OUTCOME) return day.sleepScore != null && day.sleepScore <= POOR_SLEEP_THRESHOLD
  return day.outcomeLabels.has(outcomeLabel)
}

function confidenceLabel(n: number): string {
  if (n >= 15) return 'solid'
  if (n >= 8) return 'moderate'
  return 'tentative'
}

function formatFinding(
  inputLabel: string,
  outcomeLabel: string,
  rateWithInput: number,
  rateWithoutInput: number,
  daysWithInput: number,
  daysWithoutInput: number,
): string {
  const withPct = Math.round(rateWithInput * 100)
  const withoutPct = Math.round(rateWithoutInput * 100)
  const conf = confidenceLabel(Math.min(daysWithInput, daysWithoutInput))
  return `On ${withPct}% of days with ${inputLabel} (n=${daysWithInput}), ${outcomeLabel} was reported, vs ${withoutPct}% on days without (n=${daysWithoutInput}) — ${conf}.`
}

// Explainable co-occurrence detection: no ML, just rate comparisons with
// minimum-sample-size and minimum-effect-size guards so it doesn't claim
// patterns from a handful of data points.
export function computeCorrelations(days: DayRecord[]): CorrelationFinding[] {
  if (days.length < MIN_TOTAL_DAYS) return []

  const { minSample, minLift } = getThresholds(days.length)

  const inputLabels = new Set<string>()
  const outcomeLabels = new Set<string>([BAD_SLEEP_OUTCOME])
  for (const day of days) {
    for (const label of day.inputLabels) inputLabels.add(label)
    for (const label of day.outcomeLabels) outcomeLabels.add(label)
  }

  const findings: CorrelationFinding[] = []

  for (const inputLabel of inputLabels) {
    const daysWith = days.filter((d) => d.inputLabels.has(inputLabel))
    const daysWithout = days.filter((d) => !d.inputLabels.has(inputLabel))

    if (daysWith.length < minSample || daysWithout.length < minSample) continue

    for (const outcomeLabel of outcomeLabels) {
      const withCount = daysWith.filter((d) => hasOutcome(d, outcomeLabel)).length
      const withoutCount = daysWithout.filter((d) => hasOutcome(d, outcomeLabel)).length

      const rateWithInput = withCount / daysWith.length
      const rateWithoutInput = withoutCount / daysWithout.length
      const lift = rateWithInput - rateWithoutInput

      if (Math.abs(lift) < minLift) continue

      findings.push({
        inputLabel,
        outcomeLabel,
        daysWithInput: daysWith.length,
        daysWithoutInput: daysWithout.length,
        rateWithInput,
        rateWithoutInput,
        lift,
        summary: formatFinding(inputLabel, outcomeLabel, rateWithInput, rateWithoutInput, daysWith.length, daysWithout.length),
      })
    }
  }

  return findings
    .sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift) || b.daysWithInput - a.daysWithInput)
    .slice(0, MAX_FINDINGS)
}

export interface MoodFinding {
  inputLabel: string
  daysWithInput: number
  daysWithoutInput: number
  avgMoodWithInput: number
  avgMoodWithoutInput: number
  diff: number
  summary: string
  context?: string
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// Same explainable approach as computeCorrelations, but compares average
// 1-10 mood score instead of a binary outcome rate.
export function computeMoodImpacts(days: DayRecord[]): MoodFinding[] {
  if (days.length < MIN_TOTAL_DAYS) return []

  const { minSample, minMoodDiff } = getThresholds(days.length)

  const inputLabels = new Set<string>()
  for (const day of days) {
    for (const label of day.inputLabels) inputLabels.add(label)
  }

  const findings: MoodFinding[] = []

  for (const inputLabel of inputLabels) {
    const daysWith = days.filter((d) => d.inputLabels.has(inputLabel))
    const daysWithout = days.filter((d) => !d.inputLabels.has(inputLabel))

    if (daysWith.length < minSample || daysWithout.length < minSample) continue

    const moodWith = daysWith.flatMap((d) => d.moodScores)
    const moodWithout = daysWithout.flatMap((d) => d.moodScores)

    if (moodWith.length < minSample || moodWithout.length < minSample) continue

    const avgMoodWithInput = average(moodWith)!
    const avgMoodWithoutInput = average(moodWithout)!
    const diff = avgMoodWithInput - avgMoodWithoutInput

    if (Math.abs(diff) < minMoodDiff) continue

    findings.push({
      inputLabel,
      daysWithInput: daysWith.length,
      daysWithoutInput: daysWithout.length,
      avgMoodWithInput,
      avgMoodWithoutInput,
      diff,
      summary: `Avg mood with ${inputLabel}: ${avgMoodWithInput.toFixed(1)}/10 (n=${daysWith.length}), without: ${avgMoodWithoutInput.toFixed(1)}/10 (n=${daysWithout.length}) — ${confidenceLabel(Math.min(daysWith.length, daysWithout.length))}.`,
    })
  }

  return findings.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, MAX_FINDINGS)
}

// Carryover detection across time-of-day periods: an earlier period's inputs
// (and outcomes, since a symptom/mood can itself carry forward) compared
// against a later period's outcomes. Evening -> next-morning is the one
// cross-day relationship, covering things like "drank in the evening, felt
// rough the next morning" — everything else stays within the same day.
interface PeriodPairRule {
  earlierPeriod: CarryoverPeriod
  laterPeriod: CarryoverPeriod
  crossesDay: boolean
}

const PERIOD_PAIR_RULES: PeriodPairRule[] = [
  { earlierPeriod: 'MORNING', laterPeriod: 'DAY', crossesDay: false },
  { earlierPeriod: 'MORNING', laterPeriod: 'EVENING', crossesDay: false },
  { earlierPeriod: 'DAY', laterPeriod: 'EVENING', crossesDay: false },
  { earlierPeriod: 'EVENING', laterPeriod: 'MORNING', crossesDay: true },
]

interface PeriodPair {
  earlier: PeriodRecord
  later: PeriodRecord
}

function periodWord(period: CarryoverPeriod): string {
  return period === 'DAY' ? 'midday' : period.toLowerCase()
}

function laterPeriodPhrase(period: CarryoverPeriod, crossesDay: boolean): string {
  const word = periodWord(period)
  return crossesDay ? `the next ${word}` : `that ${word}`
}

function pairsForRule(
  periods: PeriodRecord[],
  byKey: Map<string, PeriodRecord>,
  rule: PeriodPairRule,
): PeriodPair[] {
  const pairs: PeriodPair[] = []
  for (const record of periods) {
    if (record.period !== rule.earlierPeriod) continue
    const laterDate = rule.crossesDay ? nextDayKey(record.date) : record.date
    const later = byKey.get(`${laterDate}|${rule.laterPeriod}`)
    if (later) pairs.push({ earlier: record, later })
  }
  return pairs
}

function predictorPresent(pair: PeriodPair, label: string): boolean {
  return pair.earlier.inputLabels.has(label) || pair.earlier.outcomeLabels.has(label)
}

function hasPeriodOutcome(pair: PeriodPair, label: string): boolean {
  if (label === BAD_SLEEP_OUTCOME) {
    return pair.later.sleepScore != null && pair.later.sleepScore <= POOR_SLEEP_THRESHOLD
  }
  return pair.later.outcomeLabels.has(label)
}

// Sleep quality is only a meaningful "later" outcome for the one cross-day
// relationship — last night's sleep can't be caused by something later the
// same day, since it already happened before that.
function includesSleepOutcome(rule: PeriodPairRule): boolean {
  return rule.crossesDay && rule.laterPeriod === 'MORNING'
}

// Same explainable approach and guards as computeCorrelations/computeMoodImpacts,
// just comparing an earlier period's predictors against a later period's outcomes.
export function computePeriodCorrelations(periods: PeriodRecord[]): CorrelationFinding[] {
  const totalDays = new Set(periods.map((p) => p.date)).size
  const { minSample, minLift } = getThresholds(totalDays)

  const byKey = new Map<string, PeriodRecord>()
  for (const p of periods) byKey.set(`${p.date}|${p.period}`, p)

  const findings: CorrelationFinding[] = []

  for (const rule of PERIOD_PAIR_RULES) {
    const pairs = pairsForRule(periods, byKey, rule)

    const predictorLabels = new Set<string>()
    const outcomeLabels = new Set<string>()
    if (includesSleepOutcome(rule)) outcomeLabels.add(BAD_SLEEP_OUTCOME)
    for (const pair of pairs) {
      for (const l of pair.earlier.inputLabels) predictorLabels.add(l)
      for (const l of pair.later.outcomeLabels) outcomeLabels.add(l)
    }

    for (const predictorLabel of predictorLabels) {
      const pairsWith = pairs.filter((p) => predictorPresent(p, predictorLabel))
      const pairsWithout = pairs.filter((p) => !predictorPresent(p, predictorLabel))

      if (pairsWith.length < minSample || pairsWithout.length < minSample) continue

      for (const outcomeLabel of outcomeLabels) {
        const withCount = pairsWith.filter((p) => hasPeriodOutcome(p, outcomeLabel)).length
        const withoutCount = pairsWithout.filter((p) => hasPeriodOutcome(p, outcomeLabel)).length

        const rateWithInput = withCount / pairsWith.length
        const rateWithoutInput = withoutCount / pairsWithout.length
        const lift = rateWithInput - rateWithoutInput

        if (Math.abs(lift) < minLift) continue

        const withPct = Math.round(rateWithInput * 100)
        const withoutPct = Math.round(rateWithoutInput * 100)
        const laterPhrase = laterPeriodPhrase(rule.laterPeriod, rule.crossesDay)

        findings.push({
          inputLabel: predictorLabel,
          outcomeLabel,
          daysWithInput: pairsWith.length,
          daysWithoutInput: pairsWithout.length,
          rateWithInput,
          rateWithoutInput,
          lift,
          summary: `${predictorLabel} in the ${periodWord(rule.earlierPeriod)} → ${outcomeLabel} ${laterPhrase}: ${withPct}% (n=${pairsWith.length}) vs ${withoutPct}% without (n=${pairsWithout.length}) — ${confidenceLabel(Math.min(pairsWith.length, pairsWithout.length))}.`,
          context: `${rule.earlierPeriod}->${rule.laterPeriod}`,
        })
      }
    }
  }

  return findings
    .sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift) || b.daysWithInput - a.daysWithInput)
    .slice(0, MAX_FINDINGS)
}

export function computePeriodMoodImpacts(periods: PeriodRecord[]): MoodFinding[] {
  const totalDays = new Set(periods.map((p) => p.date)).size
  const { minSample, minMoodDiff } = getThresholds(totalDays)

  const byKey = new Map<string, PeriodRecord>()
  for (const p of periods) byKey.set(`${p.date}|${p.period}`, p)

  const findings: MoodFinding[] = []

  for (const rule of PERIOD_PAIR_RULES) {
    const pairs = pairsForRule(periods, byKey, rule)

    const predictorLabels = new Set<string>()
    for (const pair of pairs) {
      for (const l of pair.earlier.inputLabels) predictorLabels.add(l)
    }

    for (const predictorLabel of predictorLabels) {
      const pairsWith = pairs.filter((p) => predictorPresent(p, predictorLabel))
      const pairsWithout = pairs.filter((p) => !predictorPresent(p, predictorLabel))

      if (pairsWith.length < minSample || pairsWithout.length < minSample) continue

      const moodWith = pairsWith.flatMap((p) => p.later.moodScores)
      const moodWithout = pairsWithout.flatMap((p) => p.later.moodScores)

      if (moodWith.length < minSample || moodWithout.length < minSample) continue

      const avgMoodWithInput = average(moodWith)!
      const avgMoodWithoutInput = average(moodWithout)!
      const diff = avgMoodWithInput - avgMoodWithoutInput

      if (Math.abs(diff) < minMoodDiff) continue

      const laterPhrase = laterPeriodPhrase(rule.laterPeriod, rule.crossesDay)

      findings.push({
        inputLabel: predictorLabel,
        daysWithInput: pairsWith.length,
        daysWithoutInput: pairsWithout.length,
        avgMoodWithInput,
        avgMoodWithoutInput,
        diff,
        summary: `${predictorLabel} in the ${periodWord(rule.earlierPeriod)} → mood ${laterPhrase}: ${avgMoodWithInput.toFixed(1)}/10 (n=${pairsWith.length}) vs ${avgMoodWithoutInput.toFixed(1)}/10 without (n=${pairsWithout.length}) — ${confidenceLabel(Math.min(pairsWith.length, pairsWithout.length))}.`,
        context: `${rule.earlierPeriod}->${rule.laterPeriod}`,
      })
    }
  }

  return findings.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, MAX_FINDINGS)
}
