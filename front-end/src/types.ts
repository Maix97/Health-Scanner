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
  hasIntensity: boolean
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
  sleptIn: boolean | null
  sleepHours: number | null
  isWorkDay: boolean | null
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

export type ScoreMetric = 'mood' | 'energy' | 'sleep'

export interface ScoreFinding {
  metric: ScoreMetric
  inputLabel: string
  daysWithInput: number
  daysWithoutInput: number
  avgWithInput: number
  avgWithoutInput: number
  diff: number
  summary: string
  tentative: boolean
  context?: string
}

export type MoodFinding = ScoreFinding

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

export interface SleepHoursBucket {
  bucket: string
  n: number
  avgMood: number | null
  avgEnergy: number | null
  tentative: boolean
}

export interface SleepPatterns {
  qualityVsOutcomes: SleepQualityComparison[]
  hoursBuckets: SleepHoursBucket[]
  wentToBedLateCorrelations: CorrelationFinding[]
  wentToBedLateScoreImpacts: ScoreFinding[]
  exposureSleepImpacts: ScoreFinding[]
}

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

export interface CreateCheckInInput {
  occurredAt?: string
  timePeriod?: TimePeriod | null
  sleepScore?: number | null
  wentToBedLate?: boolean | null
  sleptIn?: boolean | null
  sleepHours?: number | null
  isWorkDay?: boolean | null
  moodScore?: number | null
  energyScore?: number | null
  journalText?: string | null
  tagIds?: string[]
  tagIntensities?: Record<string, number>
  events?: { type: EventType; label: string; value?: string }[]
}
