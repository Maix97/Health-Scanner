import { buildOccurredAt, derivePeriodFromDate, toDateInputValue } from './time'

export function parseSleepHours(raw: string): number | null {
  if (!raw.trim()) return null
  const range = raw.match(/^(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)$/)
  if (range) {
    const lo = parseFloat(range[1])
    const hi = parseFloat(range[2])
    const mid = (lo + hi) / 2
    return mid >= 0 && mid <= 24 ? mid : null
  }
  const n = parseFloat(raw)
  return !isNaN(n) && n >= 0 && n <= 24 ? n : null
}
import type { CheckIn, CreateCheckInInput } from '../types'
import type { CheckInFormValues } from '../components/CheckInForm'

export function checkInToFormValues(checkIn: CheckIn): CheckInFormValues {
  const occurredAt = new Date(checkIn.occurredAt)
  return {
    date: toDateInputValue(occurredAt),
    timePeriod: checkIn.timePeriod ?? derivePeriodFromDate(occurredAt),
    moodScore: checkIn.moodScore,
    energyScore: checkIn.energyScore,
    selectedHealthIds: checkIn.tags.filter((t) => t.tag.category === 'FEELING').map((t) => t.tagId),
    selectedExerciseIds: checkIn.tags.filter((t) => t.tag.category === 'EXERCISE').map((t) => t.tagId),
    selectedFoodIds: checkIn.tags.filter((t) => t.tag.category === 'FOOD').map((t) => t.tagId),
    selectedToggleIds: checkIn.tags.filter((t) => t.tag.category === 'QUICK_TOGGLE').map((t) => t.tagId),
    tagIntensities: Object.fromEntries(
      checkIn.tags.filter((t) => t.intensity != null).map((t) => [t.tagId, t.intensity as number]),
    ),
    journalText: checkIn.journalText ?? '',
  }
}

export function checkInFormValuesToPayload(values: CheckInFormValues): CreateCheckInInput {
  if (!values.timePeriod) {
    throw new Error('checkInFormValuesToPayload called without a timePeriod — the form should block submission until one is chosen')
  }
  return {
    occurredAt: buildOccurredAt(values.date, values.timePeriod),
    timePeriod: values.timePeriod,
    moodScore: values.moodScore,
    energyScore: values.energyScore,
    journalText: values.journalText || null,
    tagIds: [
      ...values.selectedHealthIds,
      ...values.selectedExerciseIds,
      ...values.selectedFoodIds,
      ...values.selectedToggleIds,
    ],
    tagIntensities: values.tagIntensities,
  }
}
