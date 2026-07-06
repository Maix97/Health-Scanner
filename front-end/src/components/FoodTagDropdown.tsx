import { useState, useRef, useEffect } from 'react'
import type { Tag } from '../types'

interface FoodTagDropdownProps {
  tag: Tag
  children: Tag[]
  selectedFoodIds: string[]
  tagIntensities: Record<string, number>
  onToggleParent: () => void
  onToggleChild: (id: string) => void
  onIntensityChange: (tagId: string, value: number | undefined) => void
  onAddChild: (label: string) => void
}

export default function FoodTagDropdown({
  tag,
  children,
  selectedFoodIds,
  tagIntensities,
  onToggleParent,
  onToggleChild,
  onIntensityChange,
  onAddChild,
}: FoodTagDropdownProps) {
  const [open, setOpen] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const isParentSelected = selectedFoodIds.includes(tag.id)
  const selectedChildCount = children.filter((c) => selectedFoodIds.includes(c.id)).length

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  function handleParentClick() {
    onToggleParent()
    setOpen(false)
  }

  function handleArrowClick(e: React.MouseEvent) {
    e.stopPropagation()
    setOpen((v) => !v)
  }

  function submitNewChild() {
    const trimmed = newLabel.trim()
    if (!trimmed) return
    onAddChild(trimmed)
    setNewLabel('')
  }

  return (
    <div ref={ref} className="relative">
      {/* Parent chip — label toggles selection, arrow opens dropdown */}
      <div
        className={`inline-flex items-center rounded-full border text-sm capitalize transition-colors ${
          isParentSelected
            ? 'border-slate-900 bg-slate-900 text-white'
            : 'border-slate-300 bg-white text-slate-700'
        }`}
      >
        <button
          type="button"
          onClick={handleParentClick}
          className="py-1.5 pl-3 pr-2 hover:opacity-80"
        >
          {tag.label}
          {selectedChildCount > 0 && (
            <span
              className={`ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${
                isParentSelected ? 'bg-white text-slate-900' : 'bg-slate-800 text-white'
              }`}
            >
              {selectedChildCount}
            </span>
          )}
        </button>
        {isParentSelected && (
          <div className="flex gap-0.5 px-1" onClick={(e) => e.stopPropagation()}>
            {[1, 2, 3].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => onIntensityChange(tag.id, tagIntensities[tag.id] === v ? undefined : v)}
                className={`h-5 w-5 rounded text-[10px] font-semibold transition-colors ${
                  tagIntensities[tag.id] === v
                    ? 'bg-white text-slate-900'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={handleArrowClick}
          className={`border-l py-1.5 pl-1.5 pr-2.5 transition-colors hover:opacity-80 ${
            isParentSelected ? 'border-slate-700' : 'border-slate-200'
          }`}
          title="Pick specific items"
        >
          <span className={`block text-[10px] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
            ▾
          </span>
        </button>
      </div>

      {/* Dropdown card */}
      <div
        className={`absolute left-0 top-full z-50 mt-1.5 min-w-[190px] rounded-2xl border border-slate-100 bg-white shadow-xl transition-all duration-200 ${
          open
            ? 'pointer-events-auto translate-y-0 opacity-100'
            : 'pointer-events-none -translate-y-1 opacity-0'
        }`}
      >
        {/* Sub-option rows */}
        <div className="p-1.5">
          {children.map((child) => {
            const isSelected = selectedFoodIds.includes(child.id)
            const intensity = tagIntensities[child.id]
            return (
              <div
                key={child.id}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors ${
                  isSelected
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
                onClick={() => onToggleChild(child.id)}
              >
                <span className="text-sm capitalize">{child.label}</span>
                {isSelected && (
                  <div className="flex gap-0.5" onClick={(e) => e.stopPropagation()}>
                    {[1, 2, 3].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => onIntensityChange(child.id, intensity === v ? undefined : v)}
                        className={`h-5 w-5 rounded text-[10px] font-semibold transition-colors ${
                          intensity === v
                            ? 'bg-white text-slate-900'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Add custom sub-option */}
        <div className="border-t border-slate-100 px-3 py-2">
          <input
            type="text"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitNewChild()
              }
            }}
            placeholder="add option..."
            className="w-full rounded-lg px-2 py-1 text-xs text-slate-500 placeholder-slate-300 outline-none focus:bg-slate-50"
          />
        </div>
      </div>
    </div>
  )
}
