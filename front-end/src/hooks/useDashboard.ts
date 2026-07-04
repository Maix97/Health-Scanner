import { useQuery } from '@tanstack/react-query'
import { fetchDashboard } from '../api/dashboard'

export function useDashboard(days: number) {
  return useQuery({
    queryKey: ['dashboard', days],
    queryFn: () => fetchDashboard(days),
  })
}
