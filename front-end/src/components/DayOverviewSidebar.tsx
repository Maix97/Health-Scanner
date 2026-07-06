import type { CheckIn } from '../types'

const PERIODS = ['MORNING', 'DAY', 'EVENING', 'WHOLE_DAY'] as const
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
  const rows = PERIODS.flatMap((period) => {
    const c = checkIns.find((x) => x.timePeriod === period)
    if (!c) return []
    const content = render(c)
    if (!content) return []
    return [{ period, content }]
  })
  if (rows.length === 0) return null
  return (
    <>
      {rows.map(({ period, content }) => (
        <div key={period} className="flex gap-2 text-xs leading-relaxed">
          <span className="w-16 shrink-0 text-slate-400">{PERIOD_LABEL[period]}</span>
          <span className="capitalize text-slate-600">{content}</span>
        </div>
      ))}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  if (!children) return null
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{title}</p>
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

  return (
    <div className="sticky top-6 rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-sm">
      <p className="mb-3 text-xs font-semibold text-slate-500">Today's overview</p>
      <div className="space-y-4">
        {foodRows && <Section title="Food">{foodRows}</Section>}
        {exerciseRows && <Section title="Exercise">{exerciseRows}</Section>}
        {healthRows && <Section title="Health">{healthRows}</Section>}
        {toggleRows && <Section title="Other">{toggleRows}</Section>}
      </div>
    </div>
  )
}
