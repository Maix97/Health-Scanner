interface TagChipProps {
  label: string
  selected: boolean
  onClick: () => void
}

export default function TagChip({ label, selected, onClick }: TagChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm capitalize transition-colors ${
        selected
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
      }`}
    >
      {label}
    </button>
  )
}
