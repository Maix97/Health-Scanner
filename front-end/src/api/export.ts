import { apiRequest } from './client'

export function fetchExportData() {
  return apiRequest<Record<string, unknown>>('/export')
}

export function importData(payload: Record<string, unknown>) {
  return apiRequest<{ ok: boolean; tagsImported: number; checkInsImported: number }>('/import', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
