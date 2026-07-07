import { prisma } from '../db/client.js'
import { buildDayRecords, buildPeriodRecords, dayKey, type DayRecord } from './dayAggregation.js'
import {
  computeCorrelations,
  computeMoodImpacts,
  computePeriodCorrelations,
  computePeriodMoodImpacts,
  type CorrelationFinding,
  type MoodFinding,
} from './correlation.js'

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
  boosts: MoodFinding[]
  drags: MoodFinding[]
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

  const moodFindings = [...computeMoodImpacts(dayRecords), ...computePeriodMoodImpacts(periodRecords)]
  const boosts = moodFindings.filter((f) => f.diff > 0).sort((a, b) => b.diff - a.diff).slice(0, 4)
  const drags = moodFindings.filter((f) => f.diff < 0).sort((a, b) => a.diff - b.diff).slice(0, 4)

  const correlations = [...computeCorrelations(dayRecords), ...computePeriodCorrelations(periodRecords)]
  const positiveCorrelations = correlations.filter((f) => f.beneficial).sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift)).slice(0, 4)
  const negativeCorrelations = correlations.filter((f) => !f.beneficial).sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift)).slice(0, 4)

  return {
    dailyMood: buildDailyMoodSeries(dayRecords, days),
    boosts,
    drags,
    positiveCorrelations,
    negativeCorrelations,
    checkInCount: checkIns.length,
    stats: computeStats(checkIns, prevCheckIns),
  }
}
