import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchInsights, fetchPatterns, generateInsights, setInsightDismissed } from '../api/insights'

export function useInsights() {
  return useQuery({
    queryKey: ['insights'],
    queryFn: fetchInsights,
  })
}

export function useGenerateInsights() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (force: boolean) => generateInsights(force),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insights'] })
    },
  })
}

export function usePatterns() {
  return useQuery({
    queryKey: ['patterns'],
    queryFn: fetchPatterns,
  })
}

export function useDismissInsight() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => setInsightDismissed(id, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insights'] })
    },
  })
}
