import type { TimePeriod } from '../types'

const OPTIONS: { value: TimePeriod; label: string; hint: string }[] = [
  { value: 'MORNING', label: 'Morning', hint: '6am-12pm' },
  { value: 'DAY', label: 'Day', hint: '12-4pm' },
  { value: 'EVENING', label: 'Evening', hint: '4pm-12am' },
  { value: 'WHOLE_DAY', label: 'Whole day', hint: "don't recall" },
]

interface TimePeriodSelectorProps {
  value: TimePeriod | null
  onChange: (value: TimePeriod) => void
  loggedPeriods?: Set<TimePeriod>
}

export default function TimePeriodSelector({ value, onChange, loggedPeriods }: TimePeriodSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {OPTIONS.map((option) => {
        const selected = value === option.value
        const logged = loggedPeriods?.has(option.value)
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`relative rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
              selected
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
            }`}
          >
            {option.label}
            <span className={`ml-1 text-xs font-normal ${selected ? 'text-slate-300' : 'text-slate-400'}`}>
              {option.hint}
            </span>
            {logged && (
              <span
                title="Already logged"
                className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${
                  selected ? 'bg-white' : 'bg-emerald-500'
                }`}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
