import TagChip from './TagChip'

const LEVELS: { value: number; title: string }[] = [
  { value: 1, title: 'Light' },
  { value: 2, title: 'Medium' },
  { value: 3, title: 'Heavy' },
]

interface RateableTagChipProps {
  label: string
  selected: boolean
  intensity: number | undefined
  onToggle: () => void
  onIntensityChange: (value: number | undefined) => void
}

export default function RateableTagChip({
  label,
  selected,
  intensity,
  onToggle,
  onIntensityChange,
}: RateableTagChipProps) {
  return (
    <div className="inline-flex items-center gap-1">
      <TagChip label={label} selected={selected} onClick={onToggle} />
      {selected && (
        <div className="flex gap-0.5">
          {LEVELS.map((level) => (
            <button
              key={level.value}
              type="button"
              onClick={() => onIntensityChange(intensity === level.value ? undefined : level.value)}
              title={level.title}
              className={`h-6 w-6 rounded text-[10px] font-semibold ${
                intensity === level.value
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {level.value}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
