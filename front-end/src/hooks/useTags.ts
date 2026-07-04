import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTag, deleteTag, fetchTags } from '../api/tags'
import type { TagCategory } from '../types'

export function useTags(category?: TagCategory) {
  return useQuery({
    queryKey: ['tags', category],
    queryFn: () => fetchTags(category),
  })
}

export function useCreateTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createTag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
    },
  })
}

export function useDeleteTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteTag,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags'] })
      queryClient.invalidateQueries({ queryKey: ['checkins'] })
    },
  })
}
