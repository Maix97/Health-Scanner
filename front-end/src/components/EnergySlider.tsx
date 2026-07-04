import { energyColor } from '../lib/mood'

const SCALE = Array.from({ length: 10 }, (_, i) => i + 1)

interface EnergySliderProps {
  value: number | null
  onChange: (value: number | null) => void
}

export default function EnergySlider({ value, onChange }: EnergySliderProps) {
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
              style={{ backgroundColor: energyColor(n) }}
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
        <span>Drained</span>
        <span>Neutral</span>
        <span>Energetic</span>
      </div>
    </div>
  )
}
