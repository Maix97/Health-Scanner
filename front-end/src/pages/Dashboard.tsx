import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import MoodChart, { type ChartToggles } from '../components/MoodChart'
import { useDashboard } from '../hooks/useDashboard'
import type { PeriodStat } from '../api/dashboard'
import type { CorrelationFinding, MoodFinding } from '../types'

const RANGE_OPTIONS = [7, 14, 30]

const SERIES: { key: keyof ChartToggles; label: string; color: string; dash?: string }[] = [
  { key: 'mood',   label: 'Mood',   color: '#94a3b8' },
  { key: 'energy', label: 'Energy', color: '#f59e0b', dash: '5 3' },
  { key: 'sleep',  label: 'Sleep',  color: '#a78bfa', dash: '2 4' },
]

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function StatPill({
  label,
  stat,
  color,
  scale,
}: {
  label: string
  stat: PeriodStat
  color: string
  scale: string
}) {
  const { current, changePct } = stat
  let changeEl: React.ReactNode = <span className="text-slate-300">—</span>
  if (changePct != null) {
    if (changePct > 0) {
      changeEl = <span className="text-emerald-500">↑ +{changePct}%</span>
    } else if (changePct < 0) {
      changeEl = <span className="text-rose-500">↓ {changePct}%</span>
    } else {
      changeEl = <span className="text-slate-400">→ 0%</span>
    }
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-slate-400">{label}</span>
      <div className="flex items-baseline gap-1.5">
        {current != null ? (
          <span className="text-lg font-semibold text-slate-800" style={{ color }}>
            {current.toFixed(1)}
          </span>
        ) : (
          <span className="text-lg font-semibold text-slate-300">—</span>
        )}
        {current != null && <span className="text-xs text-slate-400">{scale}</span>}
      </div>
      <span className="text-xs">{changeEl}</span>
    </div>
  )
}

function MoodFindingRow({ f, positive }: { f: MoodFinding; positive: boolean }) {
  const sign = positive ? '+' : ''
  const pct = Math.round(Math.abs(f.diff) / f.avgMoodWithoutInput * 100)
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className={`mt-0.5 shrink-0 text-base leading-none ${positive ? 'text-emerald-500' : 'text-red-400'}`}>
        {positive ? '↑' : '↓'}
      </span>
      <div>
        <span className="font-medium text-slate-800">{cap(f.inputLabel)}</span>
        <span className="text-slate-500"> → mood {sign}{f.diff.toFixed(1)} pts on avg </span>
        <span className="text-slate-400 text-xs">({f.avgMoodWithInput.toFixed(1)} vs {f.avgMoodWithoutInput.toFixed(1)}, ~{pct}% {positive ? 'higher' : 'lower'})</span>
      </div>
    </div>
  )
}

function CorrelationRow({ f }: { f: CorrelationFinding }) {
  const liftPct = Math.round(Math.abs(f.lift) * 100)
  const direction = f.beneficial ? '↑' : '↓'
  const color = f.beneficial ? 'text-emerald-500' : 'text-red-400'
  const rate = Math.round(f.rateWithInput * 100)
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className={`mt-0.5 shrink-0 text-base leading-none ${color}`}>{direction}</span>
      <div>
        <span className="font-medium text-slate-800">{cap(f.inputLabel)}</span>
        <span className="text-slate-500"> → {f.outcomeLabel} {rate}% of days </span>
        <span className="text-slate-400 text-xs">(+{liftPct}% vs without)</span>
      </div>
    </div>
  )
}

function ImpactSection({
  title,
  color,
  moodFindings,
  correlations,
  emptyText,
}: {
  title: string
  color: 'green' | 'red'
  moodFindings: MoodFinding[]
  correlations: CorrelationFinding[]
  emptyText: string
}) {
  const positive = color === 'green'
  const titleClass = positive ? 'text-emerald-600' : 'text-red-600'
  const isEmpty = moodFindings.length === 0 && correlations.length === 0
  return (
    <div>
      <h2 className={`mb-3 text-sm font-semibold ${titleClass}`}>{title}</h2>
      {isEmpty ? (
        <p className="text-sm text-slate-400">{emptyText}</p>
      ) : (
        <div className="space-y-2.5">
          {moodFindings.map((f, i) => <MoodFindingRow key={`m${i}`} f={f} positive={positive} />)}
          {correlations.map((f, i) => <CorrelationRow key={`c${i}`} f={f} />)}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [days, setDays] = useState(14)
  const [show, setShow] = useState<ChartToggles>({ mood: true, energy: true, sleep: true })
  const { data, isLoading } = useDashboard(days)
  const navigate = useNavigate()

  function toggleSeries(key: keyof ChartToggles) {
    setShow((v) => ({ ...v, [key]: !v[key] }))
  }

  function handleChartDayClick(date: string) {
    navigate(`/entry?date=${date}`)
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-slate-500">An overview of how you've been doing.</p>
        </div>
        <Link
          to="/entry"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          + Add entry
        </Link>
      </div>

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-sm font-semibold text-slate-700">Trends</h2>
            <div className="flex flex-wrap gap-3">
              {SERIES.map(({ key, label, color }) => (
                <label key={key} className="flex cursor-pointer items-center gap-1.5 select-none">
                  <input
                    type="checkbox"
                    checked={show[key]}
                    onChange={() => toggleSeries(key)}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                      show[key] ? 'border-transparent' : 'border-slate-300 bg-white'
                    }`}
                    style={show[key] ? { backgroundColor: color } : {}}
                  >
                    {show[key] && (
                      <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                  <span className={`text-xs ${show[key] ? 'text-slate-700' : 'text-slate-400'}`}>{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-1">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setDays(option)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  days === option ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {option}d
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="mt-4 text-sm text-slate-500">Loading...</p>
        ) : data && data.checkInCount === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No check-ins in this range yet. Log your first one to see your mood trend here.
          </p>
        ) : (
          <>
            {data?.stats && (
              <div className="mt-3 flex gap-6 border-b border-slate-100 pb-3">
                <StatPill label="Mood" stat={data.stats.mood} color="#64748b" scale="/10" />
                <StatPill label="Energy" stat={data.stats.energy} color="#f59e0b" scale="/10" />
                <StatPill label="Sleep" stat={data.stats.sleep} color="#a78bfa" scale="/10" />
              </div>
            )}
            <div className="mt-2">
              <MoodChart data={data?.dailyMood ?? []} show={show} onDayClick={handleChartDayClick} />
            </div>
          </>
        )}
      </section>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <ImpactSection
          title="What's helping"
          color="green"
          moodFindings={data?.boosts ?? []}
          correlations={data?.positiveCorrelations ?? []}
          emptyText="Not enough data yet to tell what's helping."
        />
        <ImpactSection
          title="What's hurting"
          color="red"
          moodFindings={data?.drags ?? []}
          correlations={data?.negativeCorrelations ?? []}
          emptyText="Not enough data yet to tell what's hurting."
        />
      </section>

      <p className="mt-8 text-center text-sm text-slate-400">
        Want the full breakdown? Visit{' '}
        <Link to="/insights" className="underline">
          Insights
        </Link>
        .
      </p>
    </div>
  )
}
