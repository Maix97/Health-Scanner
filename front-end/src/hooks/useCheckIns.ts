import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createCheckIn, deleteCheckIn, fetchCheckIns, patchCheckIn } from '../api/checkins'
import { dayBoundsForDate, monthBounds, toDateInputValue } from '../lib/time'
import type { CreateCheckInInput } from '../types'

// All these query keys share the 'checkins' prefix so that the mutations
// below — which invalidate the broad ['checkins'] key — refetch every one
// of them (TanStack Query does prefix matching by default). Without this,
// a save wouldn't show up in the day summary / sleep status until something
// else happened to trigger a refetch.

// All check-ins already logged for the given date (optionally excluding one,
// e.g. the entry currently being edited), oldest first — used to warn
// against accidental double-entry when adding a new check-in.
// Sleep-only entries (timePeriod=null) are excluded — they are shown separately via SleepCard.
export function useCheckInsForDate(dateStr: string, excludeCheckInId?: string) {
  const { from, to } = dayBoundsForDate(dateStr)
  return useQuery({
    queryKey: ['checkins', 'day', dateStr],
    queryFn: () => fetchCheckIns({ from, to, limit: 50 }),
    select: (checkIns) =>
      checkIns
        .filter((c) => c.id !== excludeCheckInId && c.timePeriod !== null)
        .sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()),
  })
}

export interface MonthCheckInMarkers {
  datesWithEntries: Set<string>
  workDayDates: Set<string>
}

// Dates within the given month that have at least one check-in, and dates
// flagged as a work day, for marking days on the calendar picker.
// monthIndex is 0-based.
export function useCheckInDatesInMonth(year: number, monthIndex: number) {
  const { from, to } = monthBounds(year, monthIndex)
  return useQuery({
    queryKey: ['checkins', 'month', `${year}-${monthIndex}`],
    queryFn: () => fetchCheckIns({ from, to, limit: 200 }),
    select: (checkIns): MonthCheckInMarkers => {
      const datesWithEntries = new Set<string>()
      const workDayDates = new Set<string>()
      for (const c of checkIns) {
        const date = toDateInputValue(new Date(c.occurredAt))
        datesWithEntries.add(date)
        if (c.isWorkDay) workDayDates.add(date)
      }
      return { datesWithEntries, workDayDates }
    },
  })
}

export function useCheckIns(params: { limit?: number; offset?: number; from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['checkins', 'list', params],
    queryFn: () => fetchCheckIns(params),
  })
}

function invalidateCheckInData(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['checkins'] })
  queryClient.invalidateQueries({ queryKey: ['dashboard'] })
}

export function useCreateCheckIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createCheckIn,
    onSuccess: () => invalidateCheckInData(queryClient),
  })
}

export function usePatchCheckIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateCheckInInput> }) => patchCheckIn(id, input),
    onSuccess: () => invalidateCheckInData(queryClient),
  })
}

export function useDeleteCheckIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteCheckIn,
    onSuccess: () => invalidateCheckInData(queryClient),
  })
}

export interface DailySleepData {
  checkInId: string
  sleepScore: number | null
  wentToBedLate: boolean | null
  sleptIn: boolean | null
  sleepHours: number | null
  isWorkDay: boolean | null
}

// Finds the sleep-only check-in (timePeriod=null) for the given date.
// Sleep is stored as its own check-in, independent of any time-of-day period.
export function useDailySleep(dateStr: string) {
  const { from, to } = dayBoundsForDate(dateStr)
  return useQuery({
    queryKey: ['checkins', 'day', dateStr],
    queryFn: () => fetchCheckIns({ from, to, limit: 50 }),
    select: (checkIns): DailySleepData | null => {
      // Prefer a dedicated sleep-only entry (timePeriod=null), fall back to
      // any check-in on the day that has sleep data (legacy style).
      const sleepEntry =
        checkIns.find((c) => c.timePeriod === null) ??
        checkIns.find((c) => c.sleepScore != null)
      if (!sleepEntry) return null
      return {
        checkInId: sleepEntry.id,
        sleepScore: sleepEntry.sleepScore,
        wentToBedLate: sleepEntry.wentToBedLate,
        sleptIn: sleepEntry.sleptIn,
        sleepHours: sleepEntry.sleepHours,
        isWorkDay: sleepEntry.isWorkDay,
      }
    },
  })
}
