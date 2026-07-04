import type { Prisma, TagCategory } from '@prisma/client'

export type CheckInWithRelations = Prisma.CheckInGetPayload<{
  include: { tags: { include: { tag: true } }; events: true }
}>

const INPUT_TAG_CATEGORIES: TagCategory[] = ['QUICK_TOGGLE', 'EXERCISE', 'FOOD']

export interface DayRecord {
  date: string
  inputLabels: Set<string>
  outcomeLabels: Set<string>
  sleepScore: number | null
  moodScores: number[]
  energyScores: number[]
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Quick-toggle/exercise/food tags and food/drink/activity events are treated
// as "inputs"; feeling tags and symptom/mood events are treated as
// "outcomes" for correlation purposes.
export function buildDayRecords(checkIns: CheckInWithRelations[]): DayRecord[] {
  const byDay = new Map<string, DayRecord>()
  const sorted = [...checkIns].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())

  for (const checkIn of sorted) {
    const key = dayKey(checkIn.occurredAt)
    let record = byDay.get(key)
    if (!record) {
      record = { date: key, inputLabels: new Set(), outcomeLabels: new Set(), sleepScore: null, moodScores: [], energyScores: [] }
      byDay.set(key, record)
    }

    for (const t of checkIn.tags) {
      if (INPUT_TAG_CATEGORIES.includes(t.tag.category)) {
        record.inputLabels.add(t.tag.label.toLowerCase())
      } else {
        record.outcomeLabels.add(t.tag.label.toLowerCase())
      }
    }

    for (const e of checkIn.events) {
      if (e.type === 'FOOD' || e.type === 'DRINK' || e.type === 'ACTIVITY') {
        record.inputLabels.add(e.label.toLowerCase())
      } else {
        record.outcomeLabels.add(e.label.toLowerCase())
      }
    }

    // First chronological check-in of the day "wins" for sleep score —
    // that's the one most likely reporting on the prior night's sleep.
    if (record.sleepScore === null && typeof checkIn.sleepScore === 'number') {
      record.sleepScore = checkIn.sleepScore
    }

    if (typeof checkIn.moodScore === 'number') {
      record.moodScores.push(checkIn.moodScore)
    }
    if (typeof checkIn.energyScore === 'number') {
      record.energyScores.push(checkIn.energyScore)
    }
  }

  return Array.from(byDay.values())
}

export type TimePeriod = 'MORNING' | 'DAY' | 'EVENING' | 'WHOLE_DAY'

// The three periods that participate in time-of-day carryover correlation.
// WHOLE_DAY is excluded — it's for retroactive entries summarizing a day the
// user doesn't remember a clear morning/day/evening breakdown for, so it
// can't be anchored to a specific period pair.
export type CarryoverPeriod = 'MORNING' | 'DAY' | 'EVENING'

export const PERIOD_ORDER: CarryoverPeriod[] = ['MORNING', 'DAY', 'EVENING']

// Mirrors the boundaries shown in the Today UI: 6-12 morning, 12-16 day, 16-6 evening.
export function derivePeriod(date: Date): CarryoverPeriod {
  const hour = date.getHours()
  if (hour >= 6 && hour < 12) return 'MORNING'
  if (hour >= 12 && hour < 16) return 'DAY'
  return 'EVENING'
}

export function nextDayKey(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const next = new Date(year, month - 1, day + 1)
  return dayKey(next)
}

export interface PeriodRecord {
  date: string
  period: CarryoverPeriod
  inputLabels: Set<string>
  outcomeLabels: Set<string>
  moodScores: number[]
  energyScores: number[]
  sleepScore: number | null
}

// Same input/outcome split as buildDayRecords, but bucketed per (date, period)
// instead of per day, so carryover effects across periods can be detected
// (e.g. morning exercise vs. evening mood, or evening drinking vs. next
// morning's mood). Falls back to deriving the period from the clock time
// when a check-in wasn't explicitly tagged with one. Whole-day entries are
// skipped entirely since they have no specific period to anchor to.
export function buildPeriodRecords(checkIns: CheckInWithRelations[]): PeriodRecord[] {
  const byKey = new Map<string, PeriodRecord>()

  for (const checkIn of checkIns) {
    const rawPeriod = checkIn.timePeriod
    if (rawPeriod === 'WHOLE_DAY') continue

    const date = dayKey(checkIn.occurredAt)
    const period = rawPeriod ?? derivePeriod(checkIn.occurredAt)
    const key = `${date}|${period}`

    let record = byKey.get(key)
    if (!record) {
      record = { date, period, inputLabels: new Set(), outcomeLabels: new Set(), moodScores: [], energyScores: [], sleepScore: null }
      byKey.set(key, record)
    }

    for (const t of checkIn.tags) {
      if (INPUT_TAG_CATEGORIES.includes(t.tag.category)) {
        record.inputLabels.add(t.tag.label.toLowerCase())
      } else {
        record.outcomeLabels.add(t.tag.label.toLowerCase())
      }
    }

    for (const e of checkIn.events) {
      if (e.type === 'FOOD' || e.type === 'DRINK' || e.type === 'ACTIVITY') {
        record.inputLabels.add(e.label.toLowerCase())
      } else {
        record.outcomeLabels.add(e.label.toLowerCase())
      }
    }

    if (typeof checkIn.moodScore === 'number') {
      record.moodScores.push(checkIn.moodScore)
    }
    if (typeof checkIn.energyScore === 'number') {
      record.energyScores.push(checkIn.energyScore)
    }

    // First check-in in this period "wins" for sleep score, same rationale
    // as buildDayRecords.
    if (record.sleepScore === null && typeof checkIn.sleepScore === 'number') {
      record.sleepScore = checkIn.sleepScore
    }
  }

  return Array.from(byKey.values())
}
