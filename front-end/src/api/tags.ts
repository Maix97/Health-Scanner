import { apiRequest } from './client'
import type { Polarity, Tag, TagCategory } from '../types'

export function fetchTags(category?: TagCategory) {
  const query = category ? `?category=${category}` : ''
  return apiRequest<Tag[]>(`/tags${query}`)
}

export function createTag(input: {
  label: string
  category: TagCategory
  polarity?: Polarity
  parentTagId?: string
  hasIntensity?: boolean
}) {
  return apiRequest<Tag>('/tags', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteTag(id: string) {
  return apiRequest<{ ok: boolean; removedFromCheckIns: number }>(`/tags/${id}`, {
    method: 'DELETE',
  })
}
