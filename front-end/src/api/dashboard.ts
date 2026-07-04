import { apiRequest } from './client'
import type { MoodFinding } from '../types'

export interface DailyMoodPoint {
  date: string
  avgMood: number | null
  avgEnergy: number | null
  avgSleep: number | null
  checkInCount: number
}

export interface DashboardData {
  dailyMood: DailyMoodPoint[]
  boosts: MoodFinding[]
  drags: MoodFinding[]
  checkInCount: number
}

export function fetchDashboard(days: number) {
  return apiRequest<DashboardData>(`/dashboard?days=${days}`)
}
