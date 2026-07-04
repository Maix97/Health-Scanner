import { apiRequest } from './client'
import type { CheckIn, CreateCheckInInput } from '../types'

export function patchCheckIn(id: string, input: Partial<CreateCheckInInput>) {
  return apiRequest<CheckIn>(`/checkins/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function fetchCheckIns(params: { limit?: number; offset?: number; from?: string; to?: string } = {}) {
  const query = new URLSearchParams()
  if (params.limit) query.set('limit', String(params.limit))
  if (params.offset) query.set('offset', String(params.offset))
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  const qs = query.toString()
  return apiRequest<CheckIn[]>(`/checkins${qs ? `?${qs}` : ''}`)
}

export function createCheckIn(input: CreateCheckInInput) {
  return apiRequest<CheckIn>('/checkins', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteCheckIn(id: string) {
  return apiRequest<void>(`/checkins/${id}`, { method: 'DELETE' })
}
