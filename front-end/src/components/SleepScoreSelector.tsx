import { sleepColor } from '../lib/mood'

const SCALE = Array.from({ length: 10 }, (_, i) => i + 1)

interface SleepScoreSelectorProps {
  value: number | null
  onChange: (value: number | null) => void
}

export default function SleepScoreSelector({ value, onChange }: SleepScoreSelectorProps) {
  return (
    <div>
      <div className="flex gap-1">
        {SCALE.map((n) => {
          const selected = value === n
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(value === n ? null : n)}
              style={{ backgroundColor: sleepColor(n) }}
              className={`flex-1 rounded-md py-2 text-sm font-semibold text-white transition ${
                selected ? 'scale-110 ring-2 ring-slate-900 ring-offset-1' : 'opacity-50 hover:opacity-90'
              }`}
            >
              {n}
            </button>
          )
        })}
      </div>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>Bad</span>
        <span>Medium</span>
        <span>Good</span>
      </div>
    </div>
  )
}
