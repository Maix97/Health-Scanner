import type { CheckIn } from '../types'

const MAIN_PERIODS = ['MORNING', 'DAY', 'EVENING'] as const
const PERIOD_LABEL: Record<string, string> = {
  MORNING: 'Morning',
  DAY: 'Day',
  EVENING: 'Evening',
  WHOLE_DAY: 'All day',
}

function PeriodRows({
  checkIns,
  render,
}: {
  checkIns: CheckIn[]
  render: (c: CheckIn) => string | null
}) {
  const rows = MAIN_PERIODS.map((period) => {
    const c = checkIns.find((x) => x.timePeriod === period)
    const content = c ? render(c) : null
    return { period, content }
  })

  // Hide section entirely if no period has any data
  if (rows.every((r) => r.content === null)) return null

  const wholeDayCheckIn = checkIns.find((x) => x.timePeriod === 'WHOLE_DAY')
  const wholeDayContent = wholeDayCheckIn ? render(wholeDayCheckIn) : null

  return (
    <div>
      {rows.map(({ period, content }) => (
        <div key={period} className="flex gap-3 py-1.5 text-xs leading-relaxed">
          <span className={`w-16 shrink-0 font-medium ${content ? 'text-slate-500' : 'text-slate-400'}`}>
            {PERIOD_LABEL[period]}
          </span>
          <span className={`capitalize ${content ? 'text-slate-700' : 'text-slate-400'}`}>
            {content ?? '—'}
          </span>
        </div>
      ))}
      {wholeDayContent && (
        <div key="WHOLE_DAY" className="flex gap-3 py-1.5 text-xs leading-relaxed">
          <span className="w-16 shrink-0 font-medium text-slate-400">{PERIOD_LABEL['WHOLE_DAY']}</span>
          <span className="capitalize text-slate-600">{wholeDayContent}</span>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  if (!children) return null
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{title}</p>
      {children}
    </div>
  )
}

interface Props {
  checkIns: CheckIn[]
}

export default function DayOverviewSidebar({ checkIns }: Props) {
  const nonSleep = checkIns.filter((c) => c.timePeriod !== null)
  if (nonSleep.length === 0) return null

  function foodText(c: CheckIn) {
    const tags = c.tags.filter((t) => t.tag.category === 'FOOD')
    if (!tags.length) return null
    return tags.map((t) => (t.intensity ? `${t.tag.label} (${t.intensity})` : t.tag.label)).join(', ')
  }

  function exerciseText(c: CheckIn) {
    const tags = c.tags.filter((t) => t.tag.category === 'EXERCISE')
    if (!tags.length) return null
    return tags.map((t) => t.tag.label).join(', ')
  }

  function healthText(c: CheckIn) {
    const tags = c.tags.filter((t) => t.tag.category === 'FEELING')
    const parts: string[] = tags.map((t) => (t.intensity ? `${t.tag.label} (${t.intensity})` : t.tag.label))
    if (c.moodScore != null) parts.unshift(`mood ${c.moodScore}`)
    if (c.energyScore != null) parts.push(`energy ${c.energyScore}`)
    return parts.length ? parts.join(', ') : null
  }

  function toggleText(c: CheckIn) {
    const tags = c.tags.filter((t) => t.tag.category === 'QUICK_TOGGLE')
    return tags.length ? tags.map((t) => t.tag.label).join(', ') : null
  }

  const foodRows = <PeriodRows checkIns={nonSleep} render={foodText} />
  const exerciseRows = <PeriodRows checkIns={nonSleep} render={exerciseText} />
  const healthRows = <PeriodRows checkIns={nonSleep} render={healthText} />
  const toggleRows = <PeriodRows checkIns={nonSleep} render={toggleText} />

  if (!foodRows && !exerciseRows && !healthRows && !toggleRows) return null

  const sections = [
    { key: 'food', title: 'Food', rows: foodRows },
    { key: 'exercise', title: 'Exercise', rows: exerciseRows },
    { key: 'health', title: 'Health', rows: healthRows },
    { key: 'other', title: 'Other', rows: toggleRows },
  ].filter((s) => s.rows)

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-4 text-xs font-semibold text-slate-500">Day overview</p>
      <div className="divide-y divide-slate-200">
        {sections.map((s) => (
          <div key={s.key} className="py-3 first:pt-0 last:pb-0">
            <Section title={s.title}>{s.rows}</Section>
          </div>
        ))}
      </div>
    </div>
  )
}
