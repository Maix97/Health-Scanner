import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import CheckInForm, { type CheckInFormValues } from '../components/CheckInForm'
import DayOverviewSidebar from '../components/DayOverviewSidebar'
import SleepCard from '../components/SleepCard'
import { useCheckInsForDate, useCreateCheckIn, usePatchCheckIn } from '../hooks/useCheckIns'
import { checkInFormValuesToPayload, checkInToFormValues } from '../lib/checkInForm'
import { todayDateString } from '../lib/time'
import type { CheckIn } from '../types'

export default function Entry() {
  const createCheckIn = useCreateCheckIn()
  const patchCheckIn = usePatchCheckIn()
  const [lastResult, setLastResult] = useState<CheckIn | null>(null)
  const [editingCheckIn, setEditingCheckIn] = useState<CheckIn | null>(null)
  const [searchParams] = useSearchParams()
  const dateParam = searchParams.get('date') ?? undefined
  const [entryDate, setEntryDate] = useState(dateParam ?? todayDateString)

  const { data: dayCheckIns = [] } = useCheckInsForDate(entryDate)

  async function handleSubmit(values: CheckInFormValues, overwriteCheckInId?: string) {
    const checkIn = overwriteCheckInId
      ? await patchCheckIn.mutateAsync({ id: overwriteCheckInId, input: checkInFormValuesToPayload(values) })
      : await createCheckIn.mutateAsync(checkInFormValuesToPayload(values))
    setLastResult(checkIn)
  }

  async function handleSaveEdit(values: CheckInFormValues, overwriteCheckInId?: string) {
    const targetId = overwriteCheckInId ?? editingCheckIn?.id
    if (!targetId) return
    await patchCheckIn.mutateAsync({ id: targetId, input: checkInFormValuesToPayload(values) })
    setEditingCheckIn(null)
  }

  if (editingCheckIn) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Edit entry</h1>
        <p className="mt-1 text-slate-500">
          {new Date(editingCheckIn.occurredAt).toLocaleString()}
        </p>
        <div className="mt-6">
          <CheckInForm
            key={editingCheckIn.id}
            initialValues={checkInToFormValues(editingCheckIn)}
            onSubmit={handleSaveEdit}
            submitLabel="Save changes"
            pendingLabel="Saving..."
            isSubmitting={patchCheckIn.isPending}
            isError={patchCheckIn.isError}
            onCancel={() => setEditingCheckIn(null)}
            excludeCheckInId={editingCheckIn.id}
            allowPastDate
          />
        </div>
      </div>
    )
  }

  const extractedFromLastResult = lastResult?.events.filter((e) => e.source === 'EXTRACTED') ?? []

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Add entry</h1>
      <p className="mt-1 text-slate-500">
        Log how you're feeling. You can check in more than once a day, or backdate an entry for a past day.
      </p>

      <div className="relative mt-6">
        {/* Sidebar floats to the left, outside the form — only on wide screens */}
        <div className="fixed hidden w-52 xl:block" style={{ top: '68px', left: 'max(16px, calc(50vw - 608px))', maxHeight: 'calc(100vh - 84px)', overflowY: 'auto' }}>
          <DayOverviewSidebar checkIns={dayCheckIns} />
        </div>

        {/* Main form at its original full width */}
        <div className="space-y-6">
          <SleepCard date={entryDate} />
          <CheckInForm
            key={dateParam ?? 'add-entry'}
            initialDate={entryDate}
            onSubmit={handleSubmit}
            submitLabel="Save check-in"
            pendingLabel="Saving..."
            isSubmitting={createCheckIn.isPending}
            isError={createCheckIn.isError}
            resetAfterSubmit
            allowPastDate
            onEditCheckIn={setEditingCheckIn}
            onDateChange={setEntryDate}
          />

          {lastResult && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <p className="font-medium">Check-in saved.</p>
              {extractedFromLastResult.length > 0 && (
                <p className="mt-1">
                  Extracted from your journal: {extractedFromLastResult.map((e) => e.label).join(', ')}
                </p>
              )}
              <Link to="/" className="mt-2 inline-block font-medium underline">
                Back to Dashboard
              </Link>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
