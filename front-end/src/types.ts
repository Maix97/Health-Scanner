export type Source = 'MANUAL' | 'EXTRACTED'
export type TagCategory = 'FEELING' | 'QUICK_TOGGLE' | 'EXERCISE' | 'FOOD'
export type Polarity = 'POSITIVE' | 'NEGATIVE'
export type TimePeriod = 'MORNING' | 'DAY' | 'EVENING' | 'WHOLE_DAY'
export type EventType = 'FOOD' | 'DRINK' | 'ACTIVITY' | 'SYMPTOM' | 'MOOD'

export interface Tag {
  id: string
  label: string
  category: TagCategory
  polarity: Polarity | null
  isPreset: boolean
  parentTagId: string | null
  createdAt: string
}

export interface CheckInTag {
  id: string
  tagId: string
  source: Source
  intensity: number | null
  tag: Tag
}

export interface Event {
  id: string
  type: EventType
  label: string
  value: string | null
  source: Source
  confidence: number | null
  rawSpan: string | null
}

export interface CheckIn {
  id: string
  occurredAt: string
  timePeriod: TimePeriod | null
  sleepScore: number | null
  wentToBedLate: boolean | null
  sleepHours: number | null
  moodScore: number | null
  energyScore: number | null
  journalText: string | null
  journalProcessedAt: string | null
  createdAt: string
  updatedAt: string
  tags: CheckInTag[]
  events: Event[]
}

export type InsightKind = 'CORRELATION' | 'AI_SUMMARY'

export interface Insight {
  id: string
  generatedAt: string
  periodStart: string
  periodEnd: string
  kind: InsightKind
  content: string
  dismissed: boolean
  checkInCountAtGeneration: number
}

export interface AiSummaryContent {
  boosts: string[]
  drags: string[]
  notes: string[]
}

export interface GenerateInsightsResult {
  cached: boolean
  checkInCount: number
  newCheckInsSinceLastGeneration?: number
  minNewCheckIns?: number
  createdCorrelationInsights: Insight[]
  aiSummary: Insight | null
  noFindings?: boolean
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

export interface CreateCheckInInput {
  occurredAt?: string
  timePeriod?: TimePeriod | null
  sleepScore?: number | null
  wentToBedLate?: boolean | null
  sleepHours?: number | null
  moodScore?: number | null
  energyScore?: number | null
  journalText?: string | null
  tagIds?: string[]
  tagIntensities?: Record<string, number>
  events?: { type: EventType; label: string; value?: string }[]
}
