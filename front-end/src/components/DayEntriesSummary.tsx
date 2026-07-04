import { moodColor } from '../lib/mood'
import { periodLabel } from '../lib/time'
import type { CheckIn } from '../types'

interface DayEntriesSummaryProps {
  checkIns: CheckIn[]
  onEdit?: (checkIn: CheckIn) => void
}

export default function DayEntriesSummary({ checkIns, onEdit }: DayEntriesSummaryProps) {
  if (checkIns.length === 0) return null

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="font-medium">
        Already logged {checkIns.length} entr{checkIns.length === 1 ? 'y' : 'ies'} for this day:
      </p>
      <ul className="mt-1.5 space-y-1">
        {checkIns.map((c) => {
          const tagLabels = c.tags.map((t) => t.tag.label)
          return (
            <li key={c.id} className="flex flex-wrap items-center gap-1.5">
              {c.timePeriod && (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                  {periodLabel(c.timePeriod)}
                </span>
              )}
              {c.moodScore != null && (
                <span
                  style={{ backgroundColor: moodColor(c.moodScore) }}
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                >
                  {c.moodScore}
                </span>
              )}
              {tagLabels.length > 0 && <span className="text-amber-800">{tagLabels.join(', ')}</span>}
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(c)}
                  className="ml-auto text-xs font-medium text-amber-700 underline hover:text-amber-900"
                >
                  Edit
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
