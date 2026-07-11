import { useState } from 'react'
import CheckInForm, { type CheckInFormValues } from '../components/CheckInForm'
import SleepCard from '../components/SleepCard'
import { useCheckIns, useDeleteCheckIn, usePatchCheckIn } from '../hooks/useCheckIns'
import { moodColor } from '../lib/mood'
import { periodLabel, toDateInputValue } from '../lib/time'
import { checkInFormValuesToPayload, checkInToFormValues } from '../lib/checkInForm'
import type { CheckIn } from '../types'

function MoodBadge({ score }: { score: number }) {
  return (
    <span
      style={{ backgroundColor: moodColor(score) }}
      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
    >
      {score}
    </span>
  )
}

function SourceBadge({ source }: { source: 'MANUAL' | 'EXTRACTED' }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
        source === 'MANUAL' ? 'bg-slate-200 text-slate-700' : 'bg-violet-100 text-violet-700'
      }`}
    >
      {source === 'MANUAL' ? 'manual' : 'auto'}
    </span>
  )
}

function CheckInRow({ checkIn }: { checkIn: CheckIn }) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const deleteCheckIn = useDeleteCheckIn()
  const patchCheckIn = usePatchCheckIn()

  async function handleSave(values: CheckInFormValues, overwriteCheckInId?: string) {
    await patchCheckIn.mutateAsync({
      id: overwriteCheckInId ?? checkIn.id,
      input: checkInFormValuesToPayload(values),
    })
    setEditing(false)
  }

  return (
    <li className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-left text-sm font-medium text-slate-900"
        >
          {checkIn.moodScore && <MoodBadge score={checkIn.moodScore} />}
          {new Date(checkIn.occurredAt).toLocaleString()}
          {checkIn.timePeriod ? (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {periodLabel(checkIn.timePeriod)}
            </span>
          ) : (
            <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-600">
              sleep
            </span>
          )}
          {checkIn.sleepScore != null && (
            <span className="text-xs font-normal text-slate-500">sleep: {checkIn.sleepScore}/10</span>
          )}
        </button>
        <div className="flex items-center gap-3">
          {expanded && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="text-xs text-slate-400 hover:text-slate-700"
            >
              {editing ? 'Cancel' : 'Edit'}
            </button>
          )}
          <button
            type="button"
            onClick={() => deleteCheckIn.mutate(checkIn.id)}
            className="text-xs text-slate-400 hover:text-red-600"
          >
            Delete
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 text-sm">
          {editing ? (
            <div className="space-y-4">
              <SleepCard date={toDateInputValue(new Date(checkIn.occurredAt))} />
              <CheckInForm
                initialValues={checkInToFormValues(checkIn)}
                onSubmit={handleSave}
                submitLabel="Save changes"
                pendingLabel="Saving..."
                isSubmitting={patchCheckIn.isPending}
                isError={patchCheckIn.isError}
                onCancel={() => setEditing(false)}
                excludeCheckInId={checkIn.id}
                allowPastDate
              />
            </div>
          ) : (
            <div className="space-y-2">
              {checkIn.journalText && <p className="text-slate-600">{checkIn.journalText}</p>}
              <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {checkIn.moodScore != null && (
                  <div>
                    <dt className="inline font-medium">Mood:</dt> <dd className="inline">{checkIn.moodScore}/10</dd>
                  </div>
                )}
                {checkIn.energyScore != null && (
                  <div>
                    <dt className="inline font-medium">Energy:</dt> <dd className="inline">{checkIn.energyScore}/10</dd>
                  </div>
                )}
                {checkIn.sleepScore != null && (
                  <div>
                    <dt className="inline font-medium">Sleep:</dt> <dd className="inline">{checkIn.sleepScore}/10</dd>
                  </div>
                )}
                {checkIn.sleepHours != null && (
                  <div>
                    <dt className="inline font-medium">Hours slept:</dt> <dd className="inline">{checkIn.sleepHours}</dd>
                  </div>
                )}
                {checkIn.wentToBedLate && (
                  <div>
                    <dd className="inline">Went to bed late</dd>
                  </div>
                )}
                {checkIn.sleptIn && (
                  <div>
                    <dd className="inline">Slept in</dd>
                  </div>
                )}
                {checkIn.isWorkDay && (
                  <div>
                    <dd className="inline">Work day</dd>
                  </div>
                )}
              </dl>
              <div className="flex flex-wrap gap-1.5">
                {checkIn.tags.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs capitalize text-slate-700"
                  >
                    {t.tag.label}
                    {t.intensity != null && <span className="text-slate-400">·{t.intensity}/3</span>}
                    <SourceBadge source={t.source} />
                  </span>
                ))}
                {checkIn.events.map((e) => (
                  <span
                    key={e.id}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs capitalize text-slate-700"
                  >
                    {e.label}
                    <SourceBadge source={e.source} />
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

export default function History() {
  const { data: checkIns, isLoading } = useCheckIns({ limit: 100 })

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">History</h1>
      <p className="mt-1 text-slate-500">Past check-ins, newest first.</p>

      {isLoading && <p className="mt-4 text-sm text-slate-500">Loading...</p>}

      {checkIns && checkIns.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">No check-ins yet — log your first one on the Today page.</p>
      )}

      <ul className="mt-4 space-y-2">
        {checkIns?.map((checkIn) => (
          <CheckInRow key={checkIn.id} checkIn={checkIn} />
        ))}
      </ul>
    </div>
  )
}
