import { prisma } from '../db/client.js'
import { buildDayRecords, buildPeriodRecords, dayKey, type DayRecord } from './dayAggregation.js'
import {
  computeCorrelations,
  computeEnergyImpacts,
  computeMoodImpacts,
  computePeriodCorrelations,
  computePeriodEnergyImpacts,
  computePeriodMoodImpacts,
  type CorrelationFinding,
  type ScoreFinding,
} from './correlation.js'
import { computeOrdinalFactorImpacts } from './ordinalFactors.js'

export interface DailyMoodPoint {
  date: string
  avgMood: number | null
  avgEnergy: number | null
  avgSleep: number | null
  checkInCount: number
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function deduplicateByLabel<T>(items: T[], key: (item: T) => string, score: (item: T) => number): T[] {
  const best = new Map<string, T>()
  for (const item of items) {
    const k = key(item)
    const existing = best.get(k)
    if (!existing || score(item) > score(existing)) best.set(k, item)
  }
  return [...best.values()]
}

// Effect size weighted by sample size so a large effect from few days
// doesn't beat a moderate effect from many days.
function moodScore(f: ScoreFinding): number {
  return Math.abs(f.diff) * Math.sqrt(Math.min(f.daysWithInput, f.daysWithoutInput))
}

function correlationScore(f: CorrelationFinding): number {
  return Math.abs(f.lift) * Math.sqrt(Math.min(f.daysWithInput, f.daysWithoutInput))
}

function buildDailyMoodSeries(dayRecords: DayRecord[], days: number): DailyMoodPoint[] {
  const byDate = new Map(dayRecords.map((d) => [d.date, d]))
  const points: DailyMoodPoint[] = []

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const key = dayKey(date)
    const record = byDate.get(key)

    points.push({
      date: key,
      avgMood: record ? average(record.moodScores) : null,
      avgEnergy: record ? average(record.energyScores) : null,
      avgSleep: record?.sleepScore ?? null,
      checkInCount: record ? record.moodScores.length : 0,
    })
  }

  return points
}

export interface PeriodStat {
  current: number | null
  previous: number | null
  changePct: number | null
}

export interface DashboardData {
  dailyMood: DailyMoodPoint[]
  boosts: ScoreFinding[]
  drags: ScoreFinding[]
  energyBoosts: ScoreFinding[]
  energyDrags: ScoreFinding[]
  positiveCorrelations: CorrelationFinding[]
  negativeCorrelations: CorrelationFinding[]
  checkInCount: number
  stats: {
    mood: PeriodStat
    energy: PeriodStat
    sleep: PeriodStat
  }
}

function mkStat(curr: number | null, prev: number | null): PeriodStat {
  const changePct =
    curr != null && prev != null && prev > 0
      ? Math.round(((curr - prev) / prev) * 100)
      : null
  return { current: curr, previous: prev, changePct }
}

interface RawCheckIn {
  occurredAt: Date
  moodScore: number | null
  energyScore: number | null
  sleepScore: number | null
}

function computeStats(current: RawCheckIn[], previous: RawCheckIn[]) {
  const nums = <T>(arr: T[], fn: (v: T) => number | null): number[] =>
    arr.flatMap((v) => { const n = fn(v); return n != null ? [n] : [] })

  return {
    mood: mkStat(average(nums(current, (c) => c.moodScore)), average(nums(previous, (c) => c.moodScore))),
    energy: mkStat(average(nums(current, (c) => c.energyScore)), average(nums(previous, (c) => c.energyScore))),
    sleep: mkStat(average(nums(current, (c) => c.sleepScore)), average(nums(previous, (c) => c.sleepScore))),
  }
}

export async function getDashboardData(days: number, userId: string): Promise<DashboardData> {
  const since = new Date()
  since.setDate(since.getDate() - days)

  // Fetch 2× window so we can compare current period against the one before it.
  const sinceDouble = new Date()
  sinceDouble.setDate(sinceDouble.getDate() - 2 * days)

  const allCheckIns = await prisma.checkIn.findMany({
    where: { userId, occurredAt: { gte: sinceDouble } },
    include: { tags: { include: { tag: true } }, events: true },
    orderBy: { occurredAt: 'asc' },
  })

  const checkIns = allCheckIns.filter((c) => c.occurredAt >= since)
  const prevCheckIns = allCheckIns.filter((c) => c.occurredAt < since)

  const dayRecords = buildDayRecords(checkIns)
  const periodRecords = buildPeriodRecords(checkIns)

  const ordinalImpacts = computeOrdinalFactorImpacts(dayRecords)

  const allMoodFindings = [...computeMoodImpacts(dayRecords), ...computePeriodMoodImpacts(periodRecords), ...ordinalImpacts.filter((f) => f.metric === 'mood')]
  const dedupedMoodFindings = deduplicateByLabel(allMoodFindings, (f) => f.inputLabel, moodScore)
  const boosts = dedupedMoodFindings.filter((f) => f.diff > 0).sort((a, b) => moodScore(b) - moodScore(a)).slice(0, 4)
  const drags = dedupedMoodFindings.filter((f) => f.diff < 0).sort((a, b) => moodScore(b) - moodScore(a)).slice(0, 4)

  const allEnergyFindings = [...computeEnergyImpacts(dayRecords), ...computePeriodEnergyImpacts(periodRecords), ...ordinalImpacts.filter((f) => f.metric === 'energy')]
  const dedupedEnergyFindings = deduplicateByLabel(allEnergyFindings, (f) => f.inputLabel, moodScore)
  const energyBoosts = dedupedEnergyFindings.filter((f) => f.diff > 0).sort((a, b) => moodScore(b) - moodScore(a)).slice(0, 4)
  const energyDrags = dedupedEnergyFindings.filter((f) => f.diff < 0).sort((a, b) => moodScore(b) - moodScore(a)).slice(0, 4)

  const allCorrelations = [...computeCorrelations(dayRecords), ...computePeriodCorrelations(periodRecords)]
  const dedupedCorrelations = deduplicateByLabel(allCorrelations, (f) => `${f.inputLabel}:${f.outcomeLabel}`, correlationScore)
  const positiveCorrelations = dedupedCorrelations.filter((f) => f.beneficial).sort((a, b) => correlationScore(b) - correlationScore(a)).slice(0, 4)
  const negativeCorrelations = dedupedCorrelations.filter((f) => !f.beneficial).sort((a, b) => correlationScore(b) - correlationScore(a)).slice(0, 4)

  return {
    dailyMood: buildDailyMoodSeries(dayRecords, days),
    boosts,
    drags,
    energyBoosts,
    energyDrags,
    positiveCorrelations,
    negativeCorrelations,
    checkInCount: checkIns.length,
    stats: computeStats(checkIns, prevCheckIns),
  }
}
