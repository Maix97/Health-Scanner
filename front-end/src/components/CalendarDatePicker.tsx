import { useEffect, useState } from 'react'
import { useCheckInDatesInMonth } from '../hooks/useCheckIns'
import { toDateInputValue, todayDateString } from '../lib/time'

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

interface CalendarDatePickerProps {
  value: string
  onChange: (date: string) => void
}

function parseYearMonth(dateStr: string): { year: number; monthIndex: number } {
  const [year, month] = dateStr.split('-').map(Number)
  return { year, monthIndex: month - 1 }
}

export default function CalendarDatePicker({ value, onChange }: CalendarDatePickerProps) {
  const [{ year: viewYear, monthIndex: viewMonth }, setView] = useState(() => parseYearMonth(value))

  // Re-sync the visible month if the selected date changes to a different
  // month from outside (e.g. the form resets to today after saving).
  useEffect(() => {
    const parsed = parseYearMonth(value)
    setView((prev) => (prev.year === parsed.year && prev.monthIndex === parsed.monthIndex ? prev : parsed))
  }, [value])

  const { data: datesWithEntries = new Set<string>() } = useCheckInDatesInMonth(viewYear, viewMonth)

  const today = todayDateString()
  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const startWeekday = firstOfMonth.getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  function go(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1)
    setView({ year: next.getFullYear(), monthIndex: next.getMonth() })
  }

  const monthLabel = firstOfMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  return (
    <div className="w-72 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => go(-1)}
          className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          aria-label="Previous month"
        >
          ‹
        </button>
        <span className="text-sm font-medium text-slate-900">{monthLabel}</span>
        <button
          type="button"
          onClick={() => go(1)}
          className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase text-slate-400">
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={i}>{d}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day == null) return <div key={i} />
          const dateStr = toDateInputValue(new Date(viewYear, viewMonth, day))
          const isSelected = dateStr === value
          const isToday = dateStr === today
          const isFuture = dateStr > today
          const hasEntry = datesWithEntries.has(dateStr)

          return (
            <button
              key={i}
              type="button"
              disabled={isFuture}
              onClick={() => onChange(dateStr)}
              className={`relative rounded-md py-1.5 text-xs font-medium ${
                isSelected
                  ? 'bg-slate-900 text-white'
                  : isFuture
                    ? 'cursor-not-allowed text-slate-300'
                    : 'text-slate-700 hover:bg-slate-100'
              } ${isToday && !isSelected ? 'ring-1 ring-inset ring-slate-400' : ''}`}
            >
              {day}
              {hasEntry && (
                <span
                  className={`absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full ${
                    isSelected ? 'bg-white' : 'bg-emerald-500'
                  }`}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
