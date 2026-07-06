import { apiRequest } from './client'
import type { CorrelationFinding, GenerateInsightsResult, Insight, MoodFinding } from '../types'

export interface PatternsData {
  correlations: CorrelationFinding[]
  moodImpacts: MoodFinding[]
  checkInCount: number
}

export function fetchInsights() {
  return apiRequest<Insight[]>('/insights')
}

export function generateInsights(force = false) {
  return apiRequest<GenerateInsightsResult>('/insights/generate', {
    method: 'POST',
    body: JSON.stringify({ force }),
  })
}

export function setInsightDismissed(id: string, dismissed: boolean) {
  return apiRequest<Insight>(`/insights/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ dismissed }),
  })
}

export function fetchPatterns() {
  return apiRequest<PatternsData>('/insights/patterns')
}
