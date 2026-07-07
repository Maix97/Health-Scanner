import { dayKey, nextDayKey, type CarryoverPeriod, type DayRecord, type PeriodRecord } from './dayAggregation.js'
import { benjaminiHochberg, fisherExactPValue } from './stats.js'

export const MIN_TOTAL_DAYS = 7
export const MAX_FINDINGS = 8
export const BAD_SLEEP_OUTCOME = 'poor sleep'
// A co-occurring input is flagged as a potential confounder when it appears
// on this fraction of the candidate input's days.
const CO_OCCUR_THRESHOLD = 0.65
const MIN_ISOLATED_DAYS = 3
// BH-corrected p-value threshold (more lenient for small data)
const P_THRESHOLD_SMALL = 0.15  // < 20 days
const P_THRESHOLD_LARGE = 0.1   // >= 20 days
// Inputs are marked tentative until this many exposure days
const TENTATIVE_EXPOSURE = 8

export function getThresholds(totalDays: number): { minSample: number; minLift: number; minMoodDiff: number } {
  if (totalDays >= 30) return { minSample: 4, minLift: 0.25, minMoodDiff: 1.2 }
  if (totalDays >= 20) return { minSample: 3, minLift: 0.2, minMoodDiff: 1.0 }
  return { minSample: 3, minLift: 0.2, minMoodDiff: 1.0 }
}

export const MIN_SAMPLE = 3
export const MIN_LIFT = 0.2
export const MIN_MOOD_DIFF = 1.0

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
  beneficial: boolean
  pValue: number
  correctedPValue: number
  tentative: boolean
  confounded?: {
    coOccursWith: string
    isolatedDays: number
    isolatedRate: number | null
  }
  lagged?: {
    windowDays: number
    bestLag?: number
  }
  context?: string
}

// Factors whose effects linger for multiple days. Only these get lagged analysis
// to avoid inflating the multiple-testing pool with every possible food.
export interface LaggyFactor {
  tag: string
  windowDays: number
  isSleepBased?: boolean  // use sleepScore ≤ threshold instead of inputLabels
}

export const LAGGY_FACTORS: LaggyFactor[] = [
  { tag: 'alcohol', windowDays: 3 },
  { tag: 'late screen time', windowDays: 2 },
  { tag: 'poor sleep', windowDays: 2, isSleepBased: true },
]

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

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

// Builds a map of inputLabel → set of day indices for co-occurrence lookups.
function buildInputDayIndex(days: DayRecord[]): Map<string, Set<number>> {
  const index = new Map<string, Set<number>>()
  for (let i = 0; i < days.length; i++) {
    for (const label of days[i].inputLabels) {
      if (!index.has(label)) index.set(label, new Set())
      index.get(label)!.add(i)
    }
  }
  return index
}

// Checks whether any other input is a potential confounder for the given
// (inputLabel, outcomeLabel) pair and returns the confound description if so.
function checkConfound(
  inputLabel: string,
  outcomeLabel: string,
  inputDayIndices: Map<string, Set<number>>,
  inputIndices: Set<number>,
  days: DayRecord[],
): CorrelationFinding['confounded'] {
  for (const [otherLabel, otherIndices] of inputDayIndices) {
    if (otherLabel === inputLabel) continue

    const overlap = [...inputIndices].filter((i) => otherIndices.has(i)).length
    if (overlap / inputIndices.size < CO_OCCUR_THRESHOLD) continue

    // Found a co-occurring input — compute the isolated signal.
    const isolatedIndices = new Set([...inputIndices].filter((i) => !otherIndices.has(i)))
    if (isolatedIndices.size < MIN_ISOLATED_DAYS) {
      return { coOccursWith: otherLabel, isolatedDays: isolatedIndices.size, isolatedRate: null }
    }

    const isolatedDays = days.filter((_, j) => isolatedIndices.has(j))
    const isolatedCount = isolatedDays.filter((d) => hasOutcome(d, outcomeLabel)).length
    return {
      coOccursWith: otherLabel,
      isolatedDays: isolatedIndices.size,
      isolatedRate: isolatedCount / isolatedDays.length,
    }
  }
  return undefined
}

// Explainable co-occurrence detection: pairwise Fisher's exact test + BH
// FDR correction, with co-occurrence confound detection.
export function computeCorrelations(days: DayRecord[]): CorrelationFinding[] {
  if (days.length < MIN_TOTAL_DAYS) return []

  const { minSample } = getThresholds(days.length)
  const pThreshold = days.length >= 20 ? P_THRESHOLD_LARGE : P_THRESHOLD_SMALL

  const inputLabels = new Set<string>()
  const outcomeLabels = new Set<string>([BAD_SLEEP_OUTCOME])
  const positiveOutcomes = new Set<string>()
  for (const day of days) {
    for (const l of day.inputLabels) inputLabels.add(l)
    for (const l of day.outcomeLabels) outcomeLabels.add(l)
    for (const l of day.positiveOutcomeLabels) positiveOutcomes.add(l)
  }

  const inputDayIndices = buildInputDayIndex(days)

  // --- Pass 1: collect all testable candidates with Fisher p-values ---
  type Candidate = {
    inputLabel: string; outcomeLabel: string
    a: number; b: number; c: number; dn: number
    rateWithInput: number; rateWithoutInput: number; lift: number
    pValue: number; beneficial: boolean
    inputIndices: Set<number>
  }
  const candidates: Candidate[] = []

  for (const inputLabel of inputLabels) {
    const inputIndices = inputDayIndices.get(inputLabel)!
    const daysWith = days.filter((_, i) => inputIndices.has(i))
    const daysWithout = days.filter((_, i) => !inputIndices.has(i))
    if (daysWith.length < minSample || daysWithout.length < minSample) continue

    for (const outcomeLabel of outcomeLabels) {
      const a = daysWith.filter((d) => hasOutcome(d, outcomeLabel)).length
      const b = daysWith.length - a
      const c = daysWithout.filter((d) => hasOutcome(d, outcomeLabel)).length
      const dn = daysWithout.length - c

      if (a === 0 && c === 0) continue

      const rateWithInput = a / (a + b)
      const rateWithoutInput = c / (c + dn)
      const lift = rateWithInput - rateWithoutInput

      // Two-tailed Fisher's: test both positive and negative associations.
      const pUp = fisherExactPValue(a, b, c, dn)
      const pDown = fisherExactPValue(c, dn, a, b)
      const pValue = Math.min(1, 2 * Math.min(pUp, pDown))

      const isPositiveOutcome = positiveOutcomes.has(outcomeLabel)
      const beneficial = outcomeLabel === BAD_SLEEP_OUTCOME ? lift < 0 : isPositiveOutcome ? lift > 0 : lift < 0

      candidates.push({ inputLabel, outcomeLabel, a, b, c, dn, rateWithInput, rateWithoutInput, lift, pValue, beneficial, inputIndices })
    }
  }

  if (candidates.length === 0) return []

  // --- Pass 2: BH FDR correction across all tested pairs ---
  const correctedPs = benjaminiHochberg(candidates.map((c) => c.pValue))

  // --- Pass 3: build findings from significant candidates + confound check ---
  const findings: CorrelationFinding[] = []

  for (let i = 0; i < candidates.length; i++) {
    const correctedPValue = correctedPs[i]
    if (correctedPValue > pThreshold) continue

    const cand = candidates[i]
    const confounded = checkConfound(cand.inputLabel, cand.outcomeLabel, inputDayIndices, cand.inputIndices, days)

    findings.push({
      inputLabel: cand.inputLabel,
      outcomeLabel: cand.outcomeLabel,
      daysWithInput: cand.a + cand.b,
      daysWithoutInput: cand.c + cand.dn,
      rateWithInput: cand.rateWithInput,
      rateWithoutInput: cand.rateWithoutInput,
      lift: cand.lift,
      summary: formatFinding(cand.inputLabel, cand.outcomeLabel, cand.rateWithInput, cand.rateWithoutInput, cand.a + cand.b, cand.c + cand.dn),
      beneficial: cand.beneficial,
      pValue: cand.pValue,
      correctedPValue,
      tentative: (cand.a + cand.b) < TENTATIVE_EXPOSURE,
      confounded,
    })
  }

  // Confounded findings go last; within each tier sort by absolute lift.
  return findings
    .sort((a, b) => {
      const aC = a.confounded ? 1 : 0
      const bC = b.confounded ? 1 : 0
      if (aC !== bC) return aC - bC
      return Math.abs(b.lift) - Math.abs(a.lift) || b.daysWithInput - a.daysWithInput
    })
    .slice(0, MAX_FINDINGS)
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

interface PeriodPair { earlier: PeriodRecord; later: PeriodRecord }

function periodWord(period: CarryoverPeriod): string {
  return period === 'DAY' ? 'midday' : period.toLowerCase()
}

function laterPeriodPhrase(period: CarryoverPeriod, crossesDay: boolean): string {
  const word = periodWord(period)
  return crossesDay ? `the next ${word}` : `that ${word}`
}

function pairsForRule(periods: PeriodRecord[], byKey: Map<string, PeriodRecord>, rule: PeriodPairRule): PeriodPair[] {
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
  return pair.earlier.inputLabels.has(label)
}

function hasPeriodOutcome(pair: PeriodPair, label: string): boolean {
  if (label === BAD_SLEEP_OUTCOME) {
    return pair.later.sleepScore != null && pair.later.sleepScore <= POOR_SLEEP_THRESHOLD
  }
  return pair.later.outcomeLabels.has(label)
}

function includesSleepOutcome(rule: PeriodPairRule): boolean {
  return rule.crossesDay && rule.laterPeriod === 'MORNING'
}

export function computePeriodCorrelations(periods: PeriodRecord[]): CorrelationFinding[] {
  const totalDays = new Set(periods.map((p) => p.date)).size
  const { minSample } = getThresholds(totalDays)
  const pThreshold = totalDays >= 20 ? P_THRESHOLD_LARGE : P_THRESHOLD_SMALL

  const byKey = new Map<string, PeriodRecord>()
  for (const p of periods) byKey.set(`${p.date}|${p.period}`, p)

  const positiveOutcomes = new Set<string>()
  for (const p of periods) {
    for (const l of p.positiveOutcomeLabels) positiveOutcomes.add(l)
  }

  type Candidate = {
    rule: PeriodPairRule
    inputLabel: string; outcomeLabel: string
    a: number; b: number; c: number; dn: number
    rateWithInput: number; rateWithoutInput: number; lift: number
    pValue: number; beneficial: boolean
  }
  const candidates: Candidate[] = []

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
        const a = pairsWith.filter((p) => hasPeriodOutcome(p, outcomeLabel)).length
        const b = pairsWith.length - a
        const c = pairsWithout.filter((p) => hasPeriodOutcome(p, outcomeLabel)).length
        const dn = pairsWithout.length - c

        if (a === 0 && c === 0) continue

        const rateWithInput = a / (a + b)
        const rateWithoutInput = c / (c + dn)
        const lift = rateWithInput - rateWithoutInput

        const pUp = fisherExactPValue(a, b, c, dn)
        const pDown = fisherExactPValue(c, dn, a, b)
        const pValue = Math.min(1, 2 * Math.min(pUp, pDown))

        const isPositiveOutcome = positiveOutcomes.has(outcomeLabel)
        const beneficial = outcomeLabel === BAD_SLEEP_OUTCOME ? lift < 0 : isPositiveOutcome ? lift > 0 : lift < 0

        candidates.push({ rule, inputLabel: predictorLabel, outcomeLabel, a, b, c, dn, rateWithInput, rateWithoutInput, lift, pValue, beneficial })
      }
    }
  }

  if (candidates.length === 0) return []

  const correctedPs = benjaminiHochberg(candidates.map((c) => c.pValue))
  const findings: CorrelationFinding[] = []

  for (let i = 0; i < candidates.length; i++) {
    const correctedPValue = correctedPs[i]
    if (correctedPValue > pThreshold) continue

    const cand = candidates[i]
    const { rule } = cand
    const withPct = Math.round(cand.rateWithInput * 100)
    const withoutPct = Math.round(cand.rateWithoutInput * 100)
    const laterPhrase = laterPeriodPhrase(rule.laterPeriod, rule.crossesDay)

    findings.push({
      inputLabel: cand.inputLabel,
      outcomeLabel: cand.outcomeLabel,
      daysWithInput: cand.a + cand.b,
      daysWithoutInput: cand.c + cand.dn,
      rateWithInput: cand.rateWithInput,
      rateWithoutInput: cand.rateWithoutInput,
      lift: cand.lift,
      summary: `${cand.inputLabel} in the ${periodWord(rule.earlierPeriod)} → ${cand.outcomeLabel} ${laterPhrase}: ${withPct}% (n=${cand.a + cand.b}) vs ${withoutPct}% without (n=${cand.c + cand.dn}) — ${confidenceLabel(Math.min(cand.a + cand.b, cand.c + cand.dn))}.`,
      beneficial: cand.beneficial,
      pValue: cand.pValue,
      correctedPValue,
      tentative: (cand.a + cand.b) < TENTATIVE_EXPOSURE,
      context: `${rule.earlierPeriod}->${rule.laterPeriod}`,
    })
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

// ─── Lagged / rolling-window analysis ────────────────────────────────────────

function hasLaggyFactor(day: DayRecord, factor: LaggyFactor): boolean {
  if (factor.isSleepBased) return day.sleepScore != null && day.sleepScore <= POOR_SLEEP_THRESHOLD
  return day.inputLabels.has(factor.tag)
}

function buildLagExposures(
  sortedDays: DayRecord[],
  factor: LaggyFactor,
): { rolling: Set<number>; perLag: Map<number, Set<number>> } {
  const byDate = new Map<string, DayRecord>(sortedDays.map((d) => [d.date, d]))
  const rolling = new Set<number>()
  const perLag = new Map<number, Set<number>>()
  for (let d = 1; d <= factor.windowDays; d++) perLag.set(d, new Set())

  for (let i = 0; i < sortedDays.length; i++) {
    const [yr, mo, dy] = sortedDays[i].date.split('-').map(Number)
    for (let lag = 1; lag <= factor.windowDays; lag++) {
      const prevKey = dayKey(new Date(yr, mo - 1, dy - lag))
      const prev = byDate.get(prevKey)
      if (prev && hasLaggyFactor(prev, factor)) {
        rolling.add(i)
        perLag.get(lag)!.add(i)
      }
    }
  }
  return { rolling, perLag }
}

export function computeLaggedCorrelations(days: DayRecord[]): CorrelationFinding[] {
  if (days.length < MIN_TOTAL_DAYS) return []

  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const { minSample } = getThresholds(sortedDays.length)
  const pThreshold = sortedDays.length >= 20 ? P_THRESHOLD_LARGE : P_THRESHOLD_SMALL

  const positiveOutcomes = new Set<string>()
  const outcomeLabels = new Set<string>([BAD_SLEEP_OUTCOME])
  for (const day of sortedDays) {
    for (const l of day.outcomeLabels) outcomeLabels.add(l)
    for (const l of day.positiveOutcomeLabels) positiveOutcomes.add(l)
  }

  type LagCand = {
    fi: number
    outcomeLabel: string
    a: number; b: number; c: number; dn: number
    rateWith: number; rateWithout: number; lift: number
    pValue: number; beneficial: boolean
    isRolling: boolean
    lag?: number
  }
  const candidates: LagCand[] = []

  for (let fi = 0; fi < LAGGY_FACTORS.length; fi++) {
    const factor = LAGGY_FACTORS[fi]
    const { rolling, perLag } = buildLagExposures(sortedDays, factor)

    const rollingDays = sortedDays.filter((_, i) => rolling.has(i))
    const notRolling = sortedDays.filter((_, i) => !rolling.has(i))
    if (rollingDays.length < minSample || notRolling.length < minSample) continue

    for (const outcomeLabel of outcomeLabels) {
      const isPositiveOutcome = positiveOutcomes.has(outcomeLabel)

      const a = rollingDays.filter((d) => hasOutcome(d, outcomeLabel)).length
      const b = rollingDays.length - a
      const c = notRolling.filter((d) => hasOutcome(d, outcomeLabel)).length
      const dn = notRolling.length - c
      if (a === 0 && c === 0) continue

      const rateWith = a / (a + b)
      const rateWithout = c / (c + dn)
      const lift = rateWith - rateWithout
      const pUp = fisherExactPValue(a, b, c, dn)
      const pDown = fisherExactPValue(c, dn, a, b)
      const pValue = Math.min(1, 2 * Math.min(pUp, pDown))
      const beneficial = outcomeLabel === BAD_SLEEP_OUTCOME ? lift < 0 : isPositiveOutcome ? lift > 0 : lift < 0

      candidates.push({ fi, outcomeLabel, a, b, c, dn, rateWith, rateWithout, lift, pValue, beneficial, isRolling: true })

      for (const [lag, lagSet] of perLag) {
        if (lagSet.size < minSample) continue
        const lagDays = sortedDays.filter((_, i) => lagSet.has(i))
        const notLag = sortedDays.filter((_, i) => !lagSet.has(i))
        if (notLag.length < minSample) continue

        const a2 = lagDays.filter((d) => hasOutcome(d, outcomeLabel)).length
        const b2 = lagDays.length - a2
        const c2 = notLag.filter((d) => hasOutcome(d, outcomeLabel)).length
        const dn2 = notLag.length - c2
        if (a2 === 0 && c2 === 0) continue

        const rWith2 = a2 / (a2 + b2)
        const rWithout2 = c2 / (c2 + dn2)
        const lift2 = rWith2 - rWithout2
        const p2Up = fisherExactPValue(a2, b2, c2, dn2)
        const p2Down = fisherExactPValue(c2, dn2, a2, b2)
        const pVal2 = Math.min(1, 2 * Math.min(p2Up, p2Down))

        candidates.push({ fi, outcomeLabel, a: a2, b: b2, c: c2, dn: dn2, rateWith: rWith2, rateWithout: rWithout2, lift: lift2, pValue: pVal2, beneficial, isRolling: false, lag })
      }
    }
  }

  if (candidates.length === 0) return []
  const correctedPs = benjaminiHochberg(candidates.map((c) => c.pValue))

  const findings: CorrelationFinding[] = []
  const emitted = new Set<string>()

  for (let fi = 0; fi < LAGGY_FACTORS.length; fi++) {
    const factor = LAGGY_FACTORS[fi]

    for (const outcomeLabel of outcomeLabels) {
      const pairKey = `${fi}:${outcomeLabel}`
      if (emitted.has(pairKey)) continue

      const ri = candidates.findIndex((c, ci) => c.fi === fi && c.outcomeLabel === outcomeLabel && c.isRolling && correctedPs[ci] <= pThreshold)

      let besti = -1
      for (let ci = 0; ci < candidates.length; ci++) {
        const c = candidates[ci]
        if (c.fi !== fi || c.outcomeLabel !== outcomeLabel || c.isRolling) continue
        if (correctedPs[ci] > pThreshold) continue
        if (besti === -1 || correctedPs[ci] < correctedPs[besti]) besti = ci
      }

      const primaryIdx = ri !== -1 ? ri : besti
      if (primaryIdx === -1) continue

      const cand = candidates[primaryIdx]
      const bestLag = besti !== -1 ? candidates[besti].lag : undefined

      const withPct = Math.round(cand.rateWith * 100)
      const withoutPct = Math.round(cand.rateWithout * 100)
      const inputDesc = cand.isRolling
        ? `${factor.tag} (past ${factor.windowDays}d)`
        : `${factor.tag} (${cand.lag}d prior)`
      let summary = `${inputDesc} → ${outcomeLabel}: ${withPct}% (n=${cand.a + cand.b}) vs ${withoutPct}% without (n=${cand.c + cand.dn}) — ${confidenceLabel(Math.min(cand.a + cand.b, cand.c + cand.dn))}.`
      if (cand.isRolling && bestLag != null) summary += ` Strongest ${bestLag}d after.`

      emitted.add(pairKey)
      findings.push({
        inputLabel: factor.tag,
        outcomeLabel,
        daysWithInput: cand.a + cand.b,
        daysWithoutInput: cand.c + cand.dn,
        rateWithInput: cand.rateWith,
        rateWithoutInput: cand.rateWithout,
        lift: cand.lift,
        summary,
        beneficial: cand.beneficial,
        pValue: cand.pValue,
        correctedPValue: correctedPs[primaryIdx],
        tentative: (cand.a + cand.b) < TENTATIVE_EXPOSURE,
        lagged: { windowDays: factor.windowDays, bestLag },
        context: `lagged:${factor.windowDays}d`,
      })
    }
  }

  return findings
    .sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift))
    .slice(0, MAX_FINDINGS)
}
