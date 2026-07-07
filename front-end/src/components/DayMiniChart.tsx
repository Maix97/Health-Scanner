import { memo } from 'react'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { moodColor, energyColor } from '../lib/mood'
import type { CheckIn, TimePeriod } from '../types'

const PERIOD_ORDER: TimePeriod[] = ['MORNING', 'DAY', 'EVENING', 'WHOLE_DAY']
const PERIOD_SHORT: Record<TimePeriod, string> = {
  MORNING: 'AM',
  DAY: 'Day',
  EVENING: 'PM',
  WHOLE_DAY: 'All',
}

function MoodDot(props: any) {
  const { cx, cy, payload } = props
  if (payload.mood == null) return null
  return <circle cx={cx} cy={cy} r={5} fill={moodColor(payload.mood)} stroke="white" strokeWidth={1.5} />
}

function EnergyDot(props: any) {
  const { cx, cy, payload } = props
  if (payload.energy == null) return null
  return <circle cx={cx} cy={cy} r={5} fill={energyColor(payload.energy)} stroke="white" strokeWidth={1.5} />
}

function MiniTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="rounded border border-slate-200 bg-white px-2 py-1 text-xs shadow-sm">
      <p className="font-medium text-slate-700">{d.label}</p>
      {d.mood != null && <p className="text-slate-500">Mood {d.mood}/10</p>}
      {d.energy != null && <p className="text-amber-500">Energy {d.energy}/10</p>}
    </div>
  )
}

interface DayMiniChartProps {
  checkIns: CheckIn[]
}

function DayMiniChart({ checkIns }: DayMiniChartProps) {
  const hasMood = checkIns.some((c) => c.moodScore != null)
  const hasEnergy = checkIns.some((c) => c.energyScore != null)
  if (!hasMood && !hasEnergy) return null

  const data = PERIOD_ORDER
    .map((period) => {
      const entry = checkIns.find((c) => c.timePeriod === period)
      if (!entry) return null
      return {
        label: PERIOD_SHORT[period],
        mood: entry.moodScore,
        energy: entry.energyScore,
      }
    })
    .filter(Boolean)

  if (data.length === 0) return null

  return (
    <div className="flex h-full flex-col justify-center">
      <p className="mb-1 text-xs font-medium text-slate-500">Today so far</p>
      <div className="rounded-md border border-slate-100 bg-slate-50 px-1 pt-1">
        <ResponsiveContainer width="100%" height={120}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <ReferenceLine yAxisId="main" y={10} stroke="#e2e8f0" strokeDasharray="3 3" />
            <ReferenceLine yAxisId="main" y={5}  stroke="#e2e8f0" strokeDasharray="3 3" />
            <ReferenceLine yAxisId="main" y={1}  stroke="#e2e8f0" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
            <YAxis yAxisId="main" domain={[0, 10]} ticks={[1, 5, 10]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={20} />
            <Tooltip content={<MiniTooltip />} />
            {hasMood && (
              <Line yAxisId="main" type="monotone" dataKey="mood" stroke="#94a3b8" strokeWidth={2} dot={<MoodDot />} connectNulls />
            )}
            {hasEnergy && (
              <Line yAxisId="main" type="monotone" dataKey="energy" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 2" dot={<EnergyDot />} connectNulls />
            )}
          </LineChart>
        </ResponsiveContainer>
        <div className="mb-1 flex gap-3 px-1 text-[10px] text-slate-400">
          {hasMood && <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 rounded bg-slate-400" />Mood</span>}
          {hasEnergy && <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 rounded bg-amber-400" />Energy</span>}
        </div>
      </div>
    </div>
  )
}

export default memo(DayMiniChart)
