import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { moodColor, energyColor, sleepColor } from '../lib/mood'
import type { DailyMoodPoint } from '../api/dashboard'

const WEEKDAY = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

function formatDateLabel(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function XAxisTick(props: any) {
  const { x, y, payload } = props
  const dateStr: string = payload?.value ?? ''
  const parts = dateStr.split('-').map(Number)
  if (parts.length !== 3 || parts.some(isNaN)) return null
  const [year, month, day] = parts
  const date = new Date(year, month - 1, day)
  const dow = date.getDay()
  if (isNaN(dow)) return null
  const weekday = WEEKDAY[dow]
  const isSunday = dow === 0
  const mainColor = isSunday ? '#f97316' : '#94a3b8'
  const subColor  = isSunday ? '#fdba74' : '#cbd5e1'

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={13} textAnchor="middle" fill={mainColor} fontSize={11} fontWeight={isSunday ? 600 : 400}>
        {day}
      </text>
      <text x={0} y={0} dy={24} textAnchor="middle" fill={subColor} fontSize={9}>
        {weekday}
      </text>
    </g>
  )
}

function MoodDot(props: any) {
  const { cx, cy, payload } = props
  if (payload?.avgMood == null) return null
  return <circle cx={cx} cy={cy} r={4} fill={moodColor(payload.avgMood)} stroke="white" strokeWidth={1} />
}

function EnergyDot(props: any) {
  const { cx, cy, payload } = props
  if (payload?.avgEnergy == null) return null
  return <circle cx={cx} cy={cy} r={4} fill={energyColor(payload.avgEnergy)} stroke="white" strokeWidth={1} />
}

function SleepDot(props: any) {
  const { cx, cy, payload } = props
  if (payload?.avgSleep == null) return null
  return <circle cx={cx} cy={cy} r={4} fill={sleepColor(payload.avgSleep)} stroke="white" strokeWidth={1} />
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const point: DailyMoodPoint = payload[0].payload
  const hasData = point.avgMood != null || point.avgEnergy != null || point.avgSleep != null
  return (
    <div className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm">
      <p className="font-medium text-slate-900">{formatDateLabel(point.date)}</p>
      {hasData ? (
        <>
          {point.avgMood != null && <p className="text-slate-600">Mood: {point.avgMood.toFixed(1)}/10</p>}
          {point.avgEnergy != null && <p className="text-amber-600">Energy: {point.avgEnergy.toFixed(1)}/10</p>}
          {point.avgSleep != null && <p className="text-violet-600">Sleep: {point.avgSleep.toFixed(1)}/10</p>}
        </>
      ) : (
        <p className="text-slate-400">No check-in</p>
      )}
    </div>
  )
}

export interface ChartToggles {
  mood: boolean
  energy: boolean
  sleep: boolean
}

interface MoodChartProps {
  data: DailyMoodPoint[]
  show: ChartToggles
  onDayClick?: (date: string) => void
}

export default function MoodChart({ data, show, onDayClick }: MoodChartProps) {
  function handleClick(chartData: any) {
    const date: string | undefined = chartData?.activePayload?.[0]?.payload?.date
    if (date) onDayClick?.(date)
  }

  return (
    <div style={{ cursor: onDayClick ? 'pointer' : undefined }}>
      <ResponsiveContainer width="100%" height={210}>
        <LineChart data={data} margin={{ top: 4, right: 32, bottom: 0, left: 0 }} onClick={handleClick}>
          <ReferenceLine yAxisId="left" y={10} stroke="#e2e8f0" />
          <ReferenceLine yAxisId="left" y={5} stroke="#e2e8f0" strokeDasharray="4 4" />
          <ReferenceLine yAxisId="left" y={1} stroke="#e2e8f0" />
          <XAxis
            dataKey="date"
            tick={<XAxisTick />}
            height={36}
            interval={data.length > 14 ? Math.ceil(data.length / 10) : 0}
            padding={{ left: 12, right: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            domain={[0, 10]}
            ticks={[1, 5, 10]}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            width={24}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            domain={[0, 10]}
            ticks={[1, 5, 10]}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            width={28}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<ChartTooltip />} />
          {show.mood && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="avgMood"
              stroke="#94a3b8"
              strokeWidth={2}
              dot={<MoodDot />}
              activeDot={{ r: 8, style: { cursor: 'pointer' }, onClick: (_e: any, p: any) => onDayClick?.(p.payload.date) }}
              connectNulls
            />
          )}
          {show.energy && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="avgEnergy"
              stroke="#f59e0b"
              strokeWidth={2}
              strokeDasharray="5 3"
              dot={<EnergyDot />}
              activeDot={{ r: 8, style: { cursor: 'pointer' }, onClick: (_e: any, p: any) => onDayClick?.(p.payload.date) }}
              connectNulls
            />
          )}
          {show.sleep && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="avgSleep"
              stroke="#a78bfa"
              strokeWidth={2}
              strokeDasharray="2 4"
              dot={<SleepDot />}
              activeDot={{ r: 8, style: { cursor: 'pointer' }, onClick: (_e: any, p: any) => onDayClick?.(p.payload.date) }}
              connectNulls
            />
          )}
          {/* Invisible line so recharts renders the right Y-axis */}
          <Line yAxisId="right" dataKey="avgMood" stroke="transparent" dot={false} activeDot={false} legendType="none" isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
