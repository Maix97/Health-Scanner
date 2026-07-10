import { benjaminiHochberg, fisherExactPValue } from './stats.js'
import { shiftDayKey, type DayRecord } from './dayAggregation.js'
import {
  average,
  computeLaggedScoreImpacts,
  confidenceLabel,
  getThresholds,
  hasOutcome,
  pThresholdFor,
  BAD_SLEEP_OUTCOME,
  MIN_SAMPLE,
  MIN_TOTAL_DAYS,
  MAX_FINDINGS,
  TENTATIVE_EXPOSURE,
  type CorrelationFinding,
  type ScoreFinding,
} from './correlation.js'

const GOOD_SLEEP_THRESHOLD = 7
const POOR_SLEEP_THRESHOLD = 4

export interface SleepQualityComparison {
  metric: 'mood' | 'energy'
  goodAvg: number
  poorAvg: number
  goodN: number
  poorN: number
  diff: number
  tentative: boolean
  summary: string
}

// Same-day: does last night's reported sleep quality track with today's mood/energy?
export function computeSleepQualityVsOutcomes(days: DayRecord[]): SleepQualityComparison[] {
  if (days.length < MIN_TOTAL_DAYS) return []

  const goodDays = days.filter((d) => d.sleepScore != null && d.sleepScore >= GOOD_SLEEP_THRESHOLD)
  const poorDays = days.filter((d) => d.sleepScore != null && d.sleepScore <= POOR_SLEEP_THRESHOLD)

  const results: SleepQualityComparison[] = []

  for (const metric of ['mood', 'energy'] as const) {
    const goodScores = goodDays.flatMap((d) => (metric === 'mood' ? d.moodScores : d.energyScores))
    const poorScores = poorDays.flatMap((d) => (metric === 'mood' ? d.moodScores : d.energyScores))
    if (goodScores.length < MIN_SAMPLE || poorScores.length < MIN_SAMPLE) continue

    const goodAvg = average(goodScores)!
    const poorAvg = average(poorScores)!
    const diff = goodAvg - poorAvg
    const n = Math.min(goodScores.length, poorScores.length)

    results.push({
      metric,
      goodAvg,
      poorAvg,
      goodN: goodScores.length,
      poorN: poorScores.length,
      diff,
      tentative: n < TENTATIVE_EXPOSURE,
      summary: `After good sleep (≥${GOOD_SLEEP_THRESHOLD}): ${metric} ${goodAvg.toFixed(1)}/10 avg (n=${goodScores.length}); after poor sleep (≤${POOR_SLEEP_THRESHOLD}): ${poorAvg.toFixed(1)}/10 avg (n=${poorScores.length}) — ${confidenceLabel(n)}.`,
    })
  }

  return results
}

export interface SleepHoursBucket {
  bucket: string
  n: number
  avgMood: number | null
  avgEnergy: number | null
  tentative: boolean
}

const HOURS_BUCKETS: { label: string; test: (h: number) => boolean }[] = [
  { label: '<6h', test: (h) => h < 6 },
  { label: '6-7h', test: (h) => h >= 6 && h < 7 },
  { label: '7-8h', test: (h) => h >= 7 && h < 8 },
  { label: '8h+', test: (h) => h >= 8 },
]

// Descriptive breakdown, not significance-tested — buckets with too few days
// are simply omitted rather than flagged tentative-but-shown.
export function computeSleepHoursBuckets(days: DayRecord[]): SleepHoursBucket[] {
  const withHours = days.filter((d) => d.sleepHours != null)
  const results: SleepHoursBucket[] = []

  for (const { label, test } of HOURS_BUCKETS) {
    const bucketDays = withHours.filter((d) => test(d.sleepHours!))
    if (bucketDays.length < MIN_SAMPLE) continue

    const moods = bucketDays.flatMap((d) => d.moodScores)
    const energies = bucketDays.flatMap((d) => d.energyScores)

    results.push({
      bucket: label,
      n: bucketDays.length,
      avgMood: moods.length > 0 ? average(moods) : null,
      avgEnergy: energies.length > 0 ? average(energies) : null,
      tentative: bucketDays.length < TENTATIVE_EXPOSURE,
    })
  }

  return results
}

// "Went to bed late" as a binary next-day exposure: day D's flag vs day D+1's
// outcomes (mood/energy/symptom rates), through the same Fisher + BH pipeline
// used for every other correlation.
export function computeWentToBedLateImpacts(days: DayRecord[]): CorrelationFinding[] {
  if (days.length < MIN_TOTAL_DAYS) return []

  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const byDate = new Map(sortedDays.map((d) => [d.date, d]))
  const { minSample } = getThresholds(sortedDays.length)
  const pThreshold = pThresholdFor(sortedDays.length)

  const positiveOutcomes = new Set<string>()
  const outcomeLabels = new Set<string>([BAD_SLEEP_OUTCOME])
  for (const day of sortedDays) {
    for (const l of day.outcomeLabels) outcomeLabels.add(l)
    for (const l of day.positiveOutcomeLabels) positiveOutcomes.add(l)
  }

  type Pair = { late: boolean; next: DayRecord }
  const pairs: Pair[] = []
  for (const day of sortedDays) {
    if (day.wentToBedLate == null) continue
    const next = byDate.get(shiftDayKey(day.date, 1))
    if (!next) continue
    pairs.push({ late: day.wentToBedLate, next })
  }

  const pairsWith = pairs.filter((p) => p.late)
  const pairsWithout = pairs.filter((p) => !p.late)
  if (pairsWith.length < minSample || pairsWithout.length < minSample) return []

  type Candidate = {
    outcomeLabel: string
    a: number; b: number; c: number; dn: number
    rateWithInput: number; rateWithoutInput: number; lift: number
    pValue: number; beneficial: boolean
  }
  const candidates: Candidate[] = []

  for (const outcomeLabel of outcomeLabels) {
    const isPositiveOutcome = positiveOutcomes.has(outcomeLabel)
    const a = pairsWith.filter((p) => hasOutcome(p.next, outcomeLabel)).length
    const b = pairsWith.length - a
    const c = pairsWithout.filter((p) => hasOutcome(p.next, outcomeLabel)).length
    const dn = pairsWithout.length - c
    if (a === 0 && c === 0) continue

    const rateWithInput = a / (a + b)
    const rateWithoutInput = c / (c + dn)
    const lift = rateWithInput - rateWithoutInput

    const pUp = fisherExactPValue(a, b, c, dn)
    const pDown = fisherExactPValue(c, dn, a, b)
    const pValue = Math.min(1, 2 * Math.min(pUp, pDown))

    const beneficial = outcomeLabel === BAD_SLEEP_OUTCOME ? lift < 0 : isPositiveOutcome ? lift > 0 : lift < 0

    candidates.push({ outcomeLabel, a, b, c, dn, rateWithInput, rateWithoutInput, lift, pValue, beneficial })
  }

  if (candidates.length === 0) return []

  const correctedPs = benjaminiHochberg(candidates.map((c) => c.pValue))
  const findings: CorrelationFinding[] = []

  for (let i = 0; i < candidates.length; i++) {
    const correctedPValue = correctedPs[i]
    if (correctedPValue > pThreshold) continue
    const cand = candidates[i]

    const withPct = Math.round(cand.rateWithInput * 100)
    const withoutPct = Math.round(cand.rateWithoutInput * 100)

    findings.push({
      inputLabel: 'went to bed late',
      outcomeLabel: cand.outcomeLabel,
      daysWithInput: cand.a + cand.b,
      daysWithoutInput: cand.c + cand.dn,
      rateWithInput: cand.rateWithInput,
      rateWithoutInput: cand.rateWithoutInput,
      lift: cand.lift,
      summary: `Went to bed late → next-day ${cand.outcomeLabel}: ${withPct}% (n=${cand.a + cand.b}) vs ${withoutPct}% without (n=${cand.c + cand.dn}) — ${confidenceLabel(Math.min(cand.a + cand.b, cand.c + cand.dn))}.`,
      beneficial: cand.beneficial,
      pValue: cand.pValue,
      correctedPValue,
      tentative: (cand.a + cand.b) < TENTATIVE_EXPOSURE,
      context: 'sleep:wentToBedLate',
    })
  }

  return findings.sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift)).slice(0, MAX_FINDINGS)
}

// Same "went to bed late" exposure, but against next-day mood/energy averages
// instead of a binary outcome rate.
export function computeWentToBedLateScoreImpacts(days: DayRecord[]): ScoreFinding[] {
  if (days.length < MIN_TOTAL_DAYS) return []

  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date))
  const byDate = new Map(sortedDays.map((d) => [d.date, d]))
  const { minSample, minMoodDiff } = getThresholds(sortedDays.length)

  const findings: ScoreFinding[] = []

  for (const metric of ['mood', 'energy'] as const) {
    const scoresWith: number[] = []
    const scoresWithout: number[] = []
    let daysWith = 0
    let daysWithout = 0

    for (const day of sortedDays) {
      if (day.wentToBedLate == null) continue
      const next = byDate.get(shiftDayKey(day.date, 1))
      if (!next) continue
      const scores = metric === 'mood' ? next.moodScores : next.energyScores
      if (scores.length === 0) continue
      if (day.wentToBedLate) {
        scoresWith.push(...scores)
        daysWith++
      } else {
        scoresWithout.push(...scores)
        daysWithout++
      }
    }

    if (daysWith < minSample || daysWithout < minSample) continue

    const avgWithInput = average(scoresWith)!
    const avgWithoutInput = average(scoresWithout)!
    const diff = avgWithInput - avgWithoutInput
    if (Math.abs(diff) < minMoodDiff) continue

    findings.push({
      metric,
      inputLabel: 'went to bed late',
      daysWithInput: daysWith,
      daysWithoutInput: daysWithout,
      avgWithInput,
      avgWithoutInput,
      diff,
      tentative: daysWith < TENTATIVE_EXPOSURE,
      summary: `Went to bed late → next-day ${metric}: ${avgWithInput.toFixed(1)}/10 (n=${daysWith}) vs ${avgWithoutInput.toFixed(1)}/10 without (n=${daysWithout}) — ${confidenceLabel(Math.min(daysWith, daysWithout))}.`,
      context: 'sleep:wentToBedLate',
    })
  }

  return findings
}

// Do yesterday's habits (alcohol, late screen time, coffee, evening exercise,
// etc — any logged input) predict that night's sleep quality? Reuses the
// generic one-day-lag score-impact engine, scored against sleepScore.
export function computeExposureSleepImpacts(days: DayRecord[]): ScoreFinding[] {
  return computeLaggedScoreImpacts(days, 'sleep', 1)
}
