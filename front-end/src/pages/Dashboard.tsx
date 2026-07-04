import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import MoodChart, { type ChartToggles } from '../components/MoodChart'
import { useDashboard } from '../hooks/useDashboard'
import type { MoodFinding } from '../types'

const RANGE_OPTIONS = [7, 14, 30]

const SERIES: { key: keyof ChartToggles; label: string; color: string; dash?: string }[] = [
  { key: 'mood',   label: 'Mood',   color: '#94a3b8' },
  { key: 'energy', label: 'Energy', color: '#f59e0b', dash: '5 3' },
  { key: 'sleep',  label: 'Sleep',  color: '#a78bfa', dash: '2 4' },
]

function FindingList({ findings, emptyText }: { findings: MoodFinding[]; emptyText: string }) {
  if (findings.length === 0) {
    return <p className="text-sm text-slate-400">{emptyText}</p>
  }
  return (
    <ul className="space-y-2">
      {findings.map((f, i) => (
        <li key={i} className="text-sm text-slate-700">
          {f.summary}
        </li>
      ))}
    </ul>
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-semibold text-slate-700">Trends</h2>
            <div className="flex gap-3">
              {SERIES.map(({ key, label, color, dash }) => (
                <label key={key} className="flex cursor-pointer items-center gap-1.5 select-none">
                  <input
                    type="checkbox"
                    checked={show[key]}
                    onChange={() => toggleSeries(key)}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded border-2 transition-colors ${
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
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
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
          <div className="mt-2">
            <MoodChart data={data?.dailyMood ?? []} show={show} onDayClick={handleChartDayClick} />
          </div>
        )}
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold text-emerald-600">Boosting your mood</h2>
          <FindingList
            findings={data?.boosts ?? []}
            emptyText="Not enough data yet to tell what's helping."
          />
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold text-red-600">Dragging your mood down</h2>
          <FindingList
            findings={data?.drags ?? []}
            emptyText="Not enough data yet to tell what's hurting."
          />
        </div>
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
