import { apiRequest } from './client'
import type { GenerateInsightsResult, Insight } from '../types'

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
