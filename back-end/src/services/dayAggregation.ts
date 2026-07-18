import type { Prisma, TagCategory } from '@prisma/client'
import { matchOrdinalLevel } from './ordinalFactors.js'

export type CheckInWithRelations = Prisma.CheckInGetPayload<{
  include: { tags: { include: { tag: true } }; events: true }
}>

const INPUT_TAG_CATEGORIES: TagCategory[] = ['QUICK_TOGGLE', 'EXERCISE', 'FOOD']

export interface DayRecord {
  date: string
  inputLabels: Set<string>
  outcomeLabels: Set<string>
  positiveOutcomeLabels: Set<string>
  sleepScore: number | null
  sleepHours: number | null
  wentToBedLate: boolean | null
  isWorkDay: boolean | null
  // Per ordinal factor name (e.g. "Hydration") → numeric level(s) reported that day.
  ordinalScores: Record<string, number[]>
  moodScores: number[]
  energyScores: number[]
}

export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

// Shifts a "YYYY-MM-DD" key by N calendar days (negative goes backward).
export function shiftDayKey(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return dayKey(new Date(year, month - 1, day + days))
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
      record = { date: key, inputLabels: new Set(), outcomeLabels: new Set(), positiveOutcomeLabels: new Set(), sleepScore: null, sleepHours: null, wentToBedLate: null, isWorkDay: null, ordinalScores: {}, moodScores: [], energyScores: [] }
      byDay.set(key, record)
    }

    for (const t of checkIn.tags) {
      const label = t.tag.label.toLowerCase()

      // Multi-level toggles (hydration, screen time): pool the numeric level
      // for ordinal analysis and only feed the worst level into the ordinary
      // binary exposure pool — otherwise each level fragments into its own
      // unrelated finding.
      const ordinal = matchOrdinalLevel(label)
      if (ordinal) {
        const scores = record.ordinalScores[ordinal.factor.name] ?? (record.ordinalScores[ordinal.factor.name] = [])
        scores.push(ordinal.value)
        if (ordinal.isWorst) record.inputLabels.add(label)
        continue
      }

      if (INPUT_TAG_CATEGORIES.includes(t.tag.category)) {
        record.inputLabels.add(label)
      } else {
        record.outcomeLabels.add(label)
        if (t.tag.polarity === 'POSITIVE') record.positiveOutcomeLabels.add(label)
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
    if (record.sleepHours === null && typeof checkIn.sleepHours === 'number') {
      record.sleepHours = checkIn.sleepHours
    }
    if (record.wentToBedLate === null && typeof checkIn.wentToBedLate === 'boolean') {
      record.wentToBedLate = checkIn.wentToBedLate
    }
    if (record.isWorkDay === null && typeof checkIn.isWorkDay === 'boolean') {
      record.isWorkDay = checkIn.isWorkDay
    }
    // Surfaced as an input label too so it flows through the existing
    // correlation/mood/energy engines the same way a "work day" tag would.
    if (checkIn.isWorkDay === true) {
      record.inputLabels.add('work day')
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
  positiveOutcomeLabels: Set<string>
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
      record = { date, period, inputLabels: new Set(), outcomeLabels: new Set(), positiveOutcomeLabels: new Set(), moodScores: [], energyScores: [], sleepScore: null }
      byKey.set(key, record)
    }

    for (const t of checkIn.tags) {
      const label = t.tag.label.toLowerCase()

      // Same ordinal collapse as buildDayRecords — only the worst level
      // joins the binary exposure pool for time-of-day carryover analysis.
      const ordinal = matchOrdinalLevel(label)
      if (ordinal) {
        if (ordinal.isWorst) record.inputLabels.add(label)
        continue
      }

      if (INPUT_TAG_CATEGORIES.includes(t.tag.category)) {
        record.inputLabels.add(label)
      } else {
        record.outcomeLabels.add(label)
        if (t.tag.polarity === 'POSITIVE') record.positiveOutcomeLabels.add(label)
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
