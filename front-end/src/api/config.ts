import { apiRequest } from './client'

export interface AppConfig {
  model: string
  claudeConfigured: boolean
}

export function fetchConfig() {
  return apiRequest<AppConfig>('/config')
}
