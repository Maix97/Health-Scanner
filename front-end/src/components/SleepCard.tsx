import { useState, useEffect } from 'react'
import SleepScoreSelector from './SleepScoreSelector'
import { useDailySleep, useCreateCheckIn, usePatchCheckIn } from '../hooks/useCheckIns'
import { parseSleepHours } from '../lib/checkInForm'

interface SleepCardProps {
  date: string
}

export default function SleepCard({ date }: SleepCardProps) {
  const { data: existing, isLoading } = useDailySleep(date)
  const createCheckIn = useCreateCheckIn()
  const patchCheckIn = usePatchCheckIn()

  const [sleepScore, setSleepScore] = useState<number | null>(null)
  const [sleepHours, setSleepHours] = useState('')
  const [wentToBedLate, setWentToBedLate] = useState(false)
  const [sleptIn, setSleptIn] = useState(false)
  const [saved, setSaved] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // Reset local state whenever the date changes so we load the new day's sleep
  useEffect(() => {
    setSleepScore(null)
    setSleepHours('')
    setWentToBedLate(false)
    setSleptIn(false)
    setSaved(false)
    setInitialized(false)
  }, [date])

  useEffect(() => {
    if (isLoading || initialized) return
    if (existing) {
      setSleepScore(existing.sleepScore)
      setSleepHours(existing.sleepHours != null ? String(existing.sleepHours) : '')
      setWentToBedLate(existing.wentToBedLate ?? false)
      setSleptIn(existing.sleptIn ?? false)
      setSaved(true)
    }
    setInitialized(true)
  }, [existing, isLoading, initialized])

  const isPending = createCheckIn.isPending || patchCheckIn.isPending
  const hasAnyData = sleepScore != null || sleepHours.trim() !== '' || wentToBedLate || sleptIn

  async function handleSave() {
    const [year, month, day] = date.split('-').map(Number)
    const occurredAt = new Date(year, month - 1, day, 6, 0, 0).toISOString()
    const payload = {
      occurredAt,
      timePeriod: null,
      sleepScore,
      sleepHours: parseSleepHours(sleepHours),
      wentToBedLate,
      sleptIn,
    }
    if (existing?.checkInId) {
      await patchCheckIn.mutateAsync({ id: existing.checkInId, input: payload })
    } else {
      await createCheckIn.mutateAsync(payload)
    }
    setSaved(true)
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-violet-900">Last night's sleep</h2>
        {saved && <span className="text-xs font-medium text-violet-500">Saved</span>}
      </div>

      <SleepScoreSelector
        value={sleepScore}
        onChange={(v) => { setSleepScore(v); setSaved(false) }}
      />

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={wentToBedLate}
            onChange={(e) => { setWentToBedLate(e.target.checked); setSaved(false) }}
          />
          Went to bed late
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={sleptIn}
            onChange={(e) => { setSleptIn(e.target.checked); setSaved(false) }}
          />
          Slept in
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Hours slept
          <input
            type="text"
            inputMode="decimal"
            placeholder="e.g. 7 or 6-7"
            value={sleepHours}
            onChange={(e) => { setSleepHours(e.target.value); setSaved(false) }}
            className="w-28 rounded-md border border-slate-300 bg-white px-2 py-1"
          />
        </label>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={isPending || !hasAnyData}
        className="mt-3 rounded-md bg-violet-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-800 disabled:opacity-40"
      >
        {isPending ? 'Saving...' : existing ? 'Update sleep' : 'Save sleep'}
      </button>
    </div>
  )
}
