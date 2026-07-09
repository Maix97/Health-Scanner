import { useState, useEffect, type FormEvent } from 'react'

const DRAFT_KEY = 'health-scanner-entry-draft'
import RateableTagChip from './RateableTagChip'
import MoodSlider from './MoodSlider'
import EnergySlider from './EnergySlider'
import FoodTagDropdown from './FoodTagDropdown'
import TimePeriodSelector from './TimePeriodSelector'
import DayEntriesSummary from './DayEntriesSummary'
import CalendarDatePicker from './CalendarDatePicker'
import { useCreateTag, useTags } from '../hooks/useTags'
import { useCheckInsForDate } from '../hooks/useCheckIns'
import { periodLabel, todayDateString } from '../lib/time'
import { checkInToFormValues } from '../lib/checkInForm'
import DayMiniChart from './DayMiniChart'
import type { CheckIn, Polarity, Tag, TagCategory, TimePeriod } from '../types'

export interface CheckInFormValues {
  date: string
  timePeriod: TimePeriod | null
  moodScore: number | null
  energyScore: number | null
  selectedHealthIds: string[]
  selectedExerciseIds: string[]
  selectedFoodIds: string[]
  selectedToggleIds: string[]
  tagIntensities: Record<string, number>
  journalText: string
}

type MultiTagKey = 'selectedHealthIds' | 'selectedExerciseIds' | 'selectedFoodIds' | 'selectedToggleIds'

export function defaultCheckInFormValues(): CheckInFormValues {
  return {
    date: todayDateString(),
    timePeriod: null,
    moodScore: null,
    energyScore: null,
    selectedHealthIds: [],
    selectedExerciseIds: [],
    selectedFoodIds: [],
    selectedToggleIds: [],
    tagIntensities: {},
    journalText: '',
  }
}


type TrackerLevel = { label: string; display: string; active: string }

function TrackerRow({
  emoji,
  name,
  levels,
  tags,
  selectedIds,
  onToggle,
}: {
  emoji: string
  name: string
  levels: TrackerLevel[]
  tags: Tag[]
  selectedIds: string[]
  onToggle: (id: string) => void
}) {
  const resolved = levels
    .map(({ label, display, active }) => ({ tag: tags.find((t) => t.label === label), display, active }))
    .filter((l): l is { tag: Tag; display: string; active: string } => l.tag != null)

  if (resolved.length === 0) return null

  const activeTag = resolved.find(({ tag }) => selectedIds.includes(tag.id))

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm">{emoji}</span>
      <span className="w-20 shrink-0 text-xs text-slate-500">{name}</span>
      {resolved.map(({ tag, display, active }) => {
        const isActive = selectedIds.includes(tag.id)
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => onToggle(tag.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              isActive ? active : activeTag ? 'border-slate-100 bg-white text-slate-400' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {display}
          </button>
        )
      })}
    </div>
  )
}

const HYDRATION_LEVELS: TrackerLevel[] = [
  { label: 'hydration low', display: 'Low', active: 'border-rose-300 bg-rose-50 text-rose-700' },
  { label: 'hydration ok', display: 'OK', active: 'border-amber-300 bg-amber-50 text-amber-700' },
  { label: 'hydration good', display: 'Good', active: 'border-sky-300 bg-sky-50 text-sky-700' },
]

const SCREEN_TIME_LEVELS: TrackerLevel[] = [
  { label: 'screen time low', display: 'Low', active: 'border-emerald-300 bg-emerald-50 text-emerald-700' },
  { label: 'screen time medium', display: 'Medium', active: 'border-amber-300 bg-amber-50 text-amber-700' },
  { label: 'screen time high', display: 'High', active: 'border-rose-300 bg-rose-50 text-rose-700' },
]

function NewTagInput({ onAdd }: { onAdd: (label: string, hasIntensity: boolean) => void }) {
  const [value, setValue] = useState('')
  const [hasIntensity, setHasIntensity] = useState(true)

  function submit() {
    const trimmed = value.trim()
    if (!trimmed) return
    onAdd(trimmed, hasIntensity)
    setValue('')
    setHasIntensity(true)
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
        placeholder="add tag..."
        className="w-28 rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
      />
      {value.trim() && (
        <div className="flex gap-1 pl-1">
          <button
            type="button"
            onClick={() => setHasIntensity(false)}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${!hasIntensity ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
            Simple
          </button>
          <button
            type="button"
            onClick={() => setHasIntensity(true)}
            className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${hasIntensity ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
            Amount
          </button>
        </div>
      )}
    </div>
  )
}

interface CheckInFormProps {
  initialValues?: CheckInFormValues
  onSubmit: (values: CheckInFormValues, overwriteCheckInId?: string) => Promise<void>
  submitLabel: string
  pendingLabel: string
  isSubmitting: boolean
  isError?: boolean
  onCancel?: () => void
  resetAfterSubmit?: boolean
  allowPastDate?: boolean
  excludeCheckInId?: string
  onEditCheckIn?: (checkIn: CheckIn) => void
  onDateChange?: (date: string) => void
  initialDate?: string
}

export default function CheckInForm({
  initialValues,
  onSubmit,
  submitLabel,
  pendingLabel,
  isSubmitting,
  isError,
  onCancel,
  resetAfterSubmit = false,
  allowPastDate = false,
  excludeCheckInId,
  onEditCheckIn,
  onDateChange,
  initialDate,
}: CheckInFormProps) {
  const { data: feelingTags = [], isLoading: feelingTagsLoading } = useTags('FEELING')
  const { data: quickToggleTags = [], isLoading: quickToggleTagsLoading } = useTags('QUICK_TOGGLE')
  const { data: exerciseTags = [], isLoading: exerciseTagsLoading } = useTags('EXERCISE')
  const { data: foodTags = [], isLoading: foodTagsLoading } = useTags('FOOD')
  const createTag = useCreateTag()

  const topLevelFoodTags = foodTags.filter((t) => !t.parentTagId)

  const isDraftMode = !initialValues && !excludeCheckInId

  const [values, setValues] = useState<CheckInFormValues>(() => {
    const defaults = initialValues ?? defaultCheckInFormValues()
    if (isDraftMode) {
      try {
        const saved = localStorage.getItem(DRAFT_KEY)
        if (saved) {
          const draft = JSON.parse(saved) as CheckInFormValues
          return initialDate ? { ...draft, date: initialDate } : draft
        }
      } catch {}
    }
    return initialDate ? { ...defaults, date: initialDate } : defaults
  })

  useEffect(() => {
    if (!isDraftMode) return
    localStorage.setItem(DRAFT_KEY, JSON.stringify(values))
  }, [values, isDraftMode])

  const hasDraft = isDraftMode && (
    values.moodScore != null ||
    values.energyScore != null ||
    values.timePeriod != null ||
    values.selectedHealthIds.length > 0 ||
    values.selectedExerciseIds.length > 0 ||
    values.selectedFoodIds.length > 0 ||
    values.selectedToggleIds.length > 0 ||
    values.journalText !== ''
  )

  const [pendingConflict, setPendingConflict] = useState<CheckIn | null>(null)
  // Tracks which existing check-in (if any) this form currently represents —
  // starts as whatever entry we were told to edit (if any), but can shift to
  // a different entry when the user clicks an already-logged time-of-day
  // button below, which loads that entry's data in place.
  const [representedCheckInId, setRepresentedCheckInId] = useState<string | undefined>(excludeCheckInId)

  const [autoLoadPeriod, setAutoLoadPeriod] = useState<TimePeriod | null>(null)
  const { data: dayEntries = [], isLoading: dayEntriesLoading } = useCheckInsForDate(values.date, representedCheckInId)
  const loggedPeriods = new Set(dayEntries.map((c) => c.timePeriod).filter((p): p is TimePeriod => p != null))

  useEffect(() => {
    if (!autoLoadPeriod || dayEntriesLoading) return
    const existing = dayEntries.find((c) => c.timePeriod === autoLoadPeriod)
    if (existing) {
      setValues({ ...checkInToFormValues(existing), date: values.date })
      setRepresentedCheckInId(existing.id)
    }
    setAutoLoadPeriod(null)
  }, [dayEntries, dayEntriesLoading, autoLoadPeriod])

  const negativeTags = feelingTags.filter((t) => t.polarity === 'NEGATIVE')
  const positiveTags = feelingTags.filter((t) => t.polarity === 'POSITIVE')

  const hydrationTagIds = new Set(
    quickToggleTags.filter((t) => t.label.startsWith('hydration ')).map((t) => t.id),
  )
  const screenTimeTagIds = new Set(
    quickToggleTags.filter((t) => t.label.startsWith('screen time ')).map((t) => t.id),
  )

  function toggle(id: string, key: MultiTagKey) {
    setValues((v) => {
      const isSelected = v[key].includes(id)
      const tagIntensities = { ...v.tagIntensities }
      if (isSelected) {
        delete tagIntensities[id]
        return { ...v, [key]: v[key].filter((x) => x !== id), tagIntensities }
      }
      // Hydration and screen time levels are mutually exclusive within their group.
      let base = v[key]
      if (hydrationTagIds.has(id)) base = base.filter((x) => !hydrationTagIds.has(x))
      if (screenTimeTagIds.has(id)) base = base.filter((x) => !screenTimeTagIds.has(x))
      return { ...v, [key]: [...base, id], tagIntensities }
    })
  }

  function setTagIntensity(tagId: string, value: number | undefined) {
    setValues((v) => {
      const tagIntensities = { ...v.tagIntensities }
      if (value === undefined) delete tagIntensities[tagId]
      else tagIntensities[tagId] = value
      return { ...v, tagIntensities }
    })
  }

  async function handleAddTag(
    label: string,
    category: TagCategory,
    polarity: Polarity | undefined,
    key: MultiTagKey,
    parentTagId?: string,
    hasIntensity?: boolean,
  ) {
    const tag = await createTag.mutateAsync({ label, category, polarity, parentTagId, hasIntensity })
    setValues((v) => ({ ...v, [key]: [...v[key], tag.id] }))
  }

  function setField<K extends keyof CheckInFormValues>(key: K, value: CheckInFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }))
  }

  // Clicking a time-of-day that's already logged loads that entry right into
  // the form (mood, tags, sleep, journal — everything), so saving overwrites
  // it in place instead of silently creating a duplicate. Clicking an empty
  // period after having loaded a different entry this way starts fresh,
  // since you're moving away from whatever was loaded.
  function handlePeriodChange(period: TimePeriod) {
    const existing = dayEntries.find((c) => c.timePeriod === period)
    if (existing) {
      setValues({ ...checkInToFormValues(existing), date: values.date })
      setRepresentedCheckInId(existing.id)
    } else if (representedCheckInId && representedCheckInId !== excludeCheckInId) {
      setValues((v) => ({ ...defaultCheckInFormValues(), date: v.date, timePeriod: period }))
      setRepresentedCheckInId(excludeCheckInId)
    } else {
      setField('timePeriod', period)
    }
  }

  function handleDateChange(date: string) {
    const period = values.timePeriod
    setValues((_v) => ({ ...defaultCheckInFormValues(), date, timePeriod: period }))
    setRepresentedCheckInId(excludeCheckInId)
    if (period) setAutoLoadPeriod(period)
    onDateChange?.(date)
  }

  async function performSubmit(overwriteCheckInId?: string) {
    await onSubmit(values, overwriteCheckInId)
    if (isDraftMode) localStorage.removeItem(DRAFT_KEY)
    if (resetAfterSubmit) {
      // Keep the selected date so logging several entries for the same
      // (often past) day doesn't bounce you back to today each time.
      setValues((v) => ({ ...defaultCheckInFormValues(), date: v.date }))
      setRepresentedCheckInId(excludeCheckInId)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!values.timePeriod) return

    // Already representing a specific entry (loaded via a period click, or
    // editing one directly) — save there, no need to ask again.
    if (representedCheckInId) {
      await performSubmit(representedCheckInId)
      return
    }

    // Fallback safety net for picking a period before dayEntries has loaded.
    const conflict = dayEntries.find((c) => c.timePeriod === values.timePeriod)
    if (conflict) {
      setPendingConflict(conflict)
      return
    }
    await performSubmit()
  }

  async function confirmOverwrite() {
    if (!pendingConflict) return
    const conflictId = pendingConflict.id
    setPendingConflict(null)
    await performSubmit(conflictId)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {allowPastDate && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">Date</h2>
          <div className="flex gap-4">
            <CalendarDatePicker value={values.date} onChange={handleDateChange} />
            <div className="flex-1 min-w-0">
              <DayMiniChart checkIns={dayEntries} />
            </div>
          </div>
        </section>
      )}

      <DayEntriesSummary checkIns={dayEntries} onEdit={onEditCheckIn} />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">When was this?</h2>
        <TimePeriodSelector value={values.timePeriod} onChange={handlePeriodChange} loggedPeriods={loggedPeriods} />
        {representedCheckInId && representedCheckInId !== excludeCheckInId && (
          <p className="mt-1.5 text-xs text-amber-700">
            Showing the entry already logged for {values.timePeriod ? periodLabel(values.timePeriod) : 'this'} —
            saving will update it.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Mood</h2>
        <MoodSlider value={values.moodScore} onChange={(v) => setField('moodScore', v)} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Energy</h2>
        <EnergySlider value={values.energyScore} onChange={(v) => setField('energyScore', v)} />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Health</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-red-600">Negative</p>
            {feelingTagsLoading && <p className="text-sm text-slate-400">Loading...</p>}
            <div className="flex flex-wrap gap-2">
              {negativeTags.map((tag) => (
                <RateableTagChip
                  key={tag.id}
                  label={tag.label}
                  selected={values.selectedHealthIds.includes(tag.id)}
                  intensity={values.tagIntensities[tag.id]}
                  hasIntensity={tag.hasIntensity}
                  onToggle={() => toggle(tag.id, 'selectedHealthIds')}
                  onIntensityChange={(value) => setTagIntensity(tag.id, value)}
                />
              ))}
              <NewTagInput onAdd={(label, hasIntensity) => handleAddTag(label, 'FEELING', 'NEGATIVE', 'selectedHealthIds', undefined, hasIntensity)} />
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600">Positive</p>
            {feelingTagsLoading && <p className="text-sm text-slate-400">Loading...</p>}
            <div className="flex flex-wrap gap-2">
              {positiveTags.map((tag) => (
                <RateableTagChip
                  key={tag.id}
                  label={tag.label}
                  selected={values.selectedHealthIds.includes(tag.id)}
                  intensity={values.tagIntensities[tag.id]}
                  hasIntensity={tag.hasIntensity}
                  onToggle={() => toggle(tag.id, 'selectedHealthIds')}
                  onIntensityChange={(value) => setTagIntensity(tag.id, value)}
                />
              ))}
              <NewTagInput onAdd={(label, hasIntensity) => handleAddTag(label, 'FEELING', 'POSITIVE', 'selectedHealthIds', undefined, hasIntensity)} />
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Exercise</h2>
        {exerciseTagsLoading && <p className="text-sm text-slate-400">Loading...</p>}
        <div className="flex flex-wrap gap-2">
          {exerciseTags.map((tag) => (
            <RateableTagChip
              key={tag.id}
              label={tag.label}
              selected={values.selectedExerciseIds.includes(tag.id)}
              intensity={values.tagIntensities[tag.id]}
              hasIntensity={tag.hasIntensity}
              onToggle={() => toggle(tag.id, 'selectedExerciseIds')}
              onIntensityChange={(value) => setTagIntensity(tag.id, value)}
            />
          ))}
          <NewTagInput onAdd={(label, hasIntensity) => handleAddTag(label, 'EXERCISE', undefined, 'selectedExerciseIds', undefined, hasIntensity)} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Food</h2>
        {foodTagsLoading && <p className="text-sm text-slate-400">Loading...</p>}
        <div className="flex flex-wrap gap-2">
          {topLevelFoodTags.map((tag) => {
            const children = foodTags.filter((t) => t.parentTagId === tag.id)
            if (children.length > 0) {
              return (
                <FoodTagDropdown
                  key={tag.id}
                  tag={tag}
                  children={children}
                  selectedFoodIds={values.selectedFoodIds}
                  tagIntensities={values.tagIntensities}
                  onToggleParent={() => toggle(tag.id, 'selectedFoodIds')}
                  onToggleChild={(id) => toggle(id, 'selectedFoodIds')}
                  onIntensityChange={setTagIntensity}
                  onAddChild={(label) => handleAddTag(label, 'FOOD', undefined, 'selectedFoodIds', tag.id)}
                />
              )
            }
            return (
              <RateableTagChip
                key={tag.id}
                label={tag.label}
                selected={values.selectedFoodIds.includes(tag.id)}
                intensity={values.tagIntensities[tag.id]}
                hasIntensity={tag.hasIntensity}
                onToggle={() => toggle(tag.id, 'selectedFoodIds')}
                onIntensityChange={(value) => setTagIntensity(tag.id, value)}
              />
            )
          })}
          <NewTagInput onAdd={(label, hasIntensity) => handleAddTag(label, 'FOOD', undefined, 'selectedFoodIds', undefined, hasIntensity)} />
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">Quick toggles</h2>
        {quickToggleTagsLoading && <p className="text-sm text-slate-400">Loading...</p>}
        <div className="flex flex-col gap-2.5">
          <TrackerRow
            emoji="💧"
            name="Hydration"
            levels={HYDRATION_LEVELS}
            tags={quickToggleTags}
            selectedIds={values.selectedToggleIds}
            onToggle={(id) => toggle(id, 'selectedToggleIds')}
          />
          <TrackerRow
            emoji="📱"
            name="Screen time"
            levels={SCREEN_TIME_LEVELS}
            tags={quickToggleTags}
            selectedIds={values.selectedToggleIds}
            onToggle={(id) => toggle(id, 'selectedToggleIds')}
          />
          <div className="flex flex-wrap gap-2">
            {quickToggleTags
              .filter((t) => !t.label.startsWith('hydration ') && !t.label.startsWith('screen time '))
              .map((tag) => (
                <RateableTagChip
                  key={tag.id}
                  label={tag.label}
                  selected={values.selectedToggleIds.includes(tag.id)}
                  intensity={values.tagIntensities[tag.id]}
                  hasIntensity={tag.hasIntensity}
                  onToggle={() => toggle(tag.id, 'selectedToggleIds')}
                  onIntensityChange={(value) => setTagIntensity(tag.id, value)}
                />
              ))}
            <NewTagInput onAdd={(label, hasIntensity) => handleAddTag(label, 'QUICK_TOGGLE', undefined, 'selectedToggleIds', undefined, hasIntensity)} />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-700">How was your day?</h2>
        <textarea
          value={values.journalText}
          onChange={(e) => setField('journalText', e.target.value)}
          placeholder="What did you eat, do, drink today? Write freely — patterns get extracted automatically."
          rows={4}
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting || !values.timePeriod}
          title={!values.timePeriod ? 'Pick when this was first' : undefined}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {isSubmitting ? pendingLabel : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        )}
        {!values.timePeriod && <p className="text-sm text-slate-400">Pick when this was, above.</p>}
        {hasDraft && !isSubmitting && (
          <p className="ml-auto text-xs text-amber-600">Draft not saved</p>
        )}
      </div>

      {isError && <p className="text-sm text-red-600">Something went wrong saving. Try again.</p>}

      {pendingConflict && pendingConflict.timePeriod && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/30">
          <div className="mx-4 w-full max-w-xs rounded-md bg-white p-4 shadow-lg">
            <p className="text-sm font-medium text-slate-900">
              You already have an entry for {periodLabel(pendingConflict.timePeriod)} on this day.
            </p>
            <p className="mt-1 text-sm text-slate-600">Do you want to overwrite it with these new values?</p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingConflict(null)}
                className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
              >
                No
              </button>
              <button
                type="button"
                onClick={confirmOverwrite}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
              >
                Yes, overwrite
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
