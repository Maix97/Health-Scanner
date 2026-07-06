import { useState } from 'react'
import { useDismissInsight, useGenerateInsights, useInsights, usePatterns } from '../hooks/useInsights'
import type { AiSummaryContent, CorrelationFinding, MoodFinding } from '../types'

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function Badge({ label, color }: { label: string; color: 'yellow' | 'orange' | 'slate' | 'emerald' }) {
  const cls = {
    yellow: 'bg-amber-50 text-amber-700 border-amber-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    slate: 'bg-slate-100 text-slate-500 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  }[color]
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {label}
    </span>
  )
}

function OutcomeRow({ f }: { f: CorrelationFinding }) {
  const withPct = Math.round(f.rateWithInput * 100)
  const withoutPct = Math.round(f.rateWithoutInput * 100)
  const liftPct = Math.round(Math.abs(f.lift) * 100)
  const positive = f.beneficial
  const arrow = positive ? '↑' : '↓'
  const color = positive ? 'text-emerald-600' : 'text-rose-600'

  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className={`mt-0.5 shrink-0 text-sm font-bold ${color}`}>{arrow}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-slate-700">{cap(f.outcomeLabel)}</span>
          {f.tentative && <Badge label="Tentative" color="yellow" />}
          {f.confounded && <Badge label={`Often with ${f.confounded.coOccursWith}`} color="orange" />}
          {!f.tentative && !f.confounded && f.daysWithInput >= 15 && <Badge label="Strong" color="emerald" />}
        </div>
        <p className="text-xs text-slate-400">
          {withPct}% of days vs {withoutPct}% without (+{liftPct}%, n={f.daysWithInput})
          {f.confounded?.isolatedRate != null && (
            <span className="ml-1 text-orange-500">
              · alone: {Math.round(f.confounded.isolatedRate * 100)}% ({f.confounded.isolatedDays}d)
            </span>
          )}
        </p>
      </div>
    </div>
  )
}

function MoodRow({ f }: { f: MoodFinding }) {
  const positive = f.diff > 0
  const sign = positive ? '+' : ''
  const arrow = positive ? '↑' : '↓'
  const color = positive ? 'text-emerald-600' : 'text-rose-600'
  const pct = Math.round(Math.abs(f.diff) / f.avgMoodWithoutInput * 100)

  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className={`mt-0.5 shrink-0 text-sm font-bold ${color}`}>{arrow}</span>
      <div>
        <span className="text-sm text-slate-700">Mood {sign}{f.diff.toFixed(1)} pts on avg</span>
        <p className="text-xs text-slate-400">
          {f.avgMoodWithInput.toFixed(1)} vs {f.avgMoodWithoutInput.toFixed(1)} without (~{pct}% {positive ? 'higher' : 'lower'}, n={f.daysWithInput})
        </p>
      </div>
    </div>
  )
}

interface TriggerGroup {
  inputLabel: string
  correlations: CorrelationFinding[]
  moodImpact: MoodFinding | undefined
  maxAbsLift: number
  hasConfound: boolean
}

function buildGroups(correlations: CorrelationFinding[], moodImpacts: MoodFinding[]): TriggerGroup[] {
  const map = new Map<string, TriggerGroup>()

  for (const f of correlations) {
    if (!map.has(f.inputLabel)) {
      map.set(f.inputLabel, { inputLabel: f.inputLabel, correlations: [], moodImpact: undefined, maxAbsLift: 0, hasConfound: false })
    }
    const g = map.get(f.inputLabel)!
    g.correlations.push(f)
    if (Math.abs(f.lift) > g.maxAbsLift) g.maxAbsLift = Math.abs(f.lift)
    if (f.confounded) g.hasConfound = true
  }

  for (const f of moodImpacts) {
    if (!map.has(f.inputLabel)) {
      map.set(f.inputLabel, { inputLabel: f.inputLabel, correlations: [], moodImpact: undefined, maxAbsLift: 0, hasConfound: false })
    }
    map.get(f.inputLabel)!.moodImpact = f
    const diff = Math.abs(f.diff) / 10
    if (diff > map.get(f.inputLabel)!.maxAbsLift) map.get(f.inputLabel)!.maxAbsLift = diff
  }

  return [...map.values()].sort((a, b) => {
    if (a.hasConfound !== b.hasConfound) return a.hasConfound ? 1 : -1
    return b.maxAbsLift - a.maxAbsLift
  })
}

function TriggerCard({ group }: { group: TriggerGroup }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="mb-1 text-sm font-semibold text-slate-800">{cap(group.inputLabel)}</p>
      <div className="divide-y divide-slate-100">
        {group.moodImpact && <MoodRow f={group.moodImpact} />}
        {group.correlations.map((f, i) => (
          <OutcomeRow key={i} f={f} />
        ))}
      </div>
    </div>
  )
}

function AiSummaryCard({ content }: { content: string }) {
  let parsed: AiSummaryContent
  try {
    parsed = JSON.parse(content)
  } catch {
    return <p className="text-sm text-slate-600 whitespace-pre-wrap">{content}</p>
  }

  return (
    <div className="space-y-3 text-sm text-slate-700">
      {parsed.boosts.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-emerald-600">Boosting</p>
          <ul className="space-y-1">
            {parsed.boosts.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-emerald-500">↑</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {parsed.drags.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-rose-600">Dragging</p>
          <ul className="space-y-1">
            {parsed.drags.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-rose-400">↓</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {parsed.notes.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-500">Notes</p>
          <ul className="space-y-1">
            {parsed.notes.map((n, i) => (
              <li key={i} className="text-slate-500">{n}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function Insights() {
  const { data: insights, isLoading: insightsLoading } = useInsights()
  const { data: patterns, isLoading: patternsLoading } = usePatterns()
  const generate = useGenerateInsights()
  const dismiss = useDismissInsight()
  const [message, setMessage] = useState<string | null>(null)

  async function handleGenerate(force = false) {
    setMessage(null)
    const result = await generate.mutateAsync(force)
    if (result.cached) {
      const remaining = (result.minNewCheckIns ?? 0) - (result.newCheckInsSinceLastGeneration ?? 0)
      setMessage(
        remaining > 0
          ? `No new AI summary yet — log ${remaining} more check-in${remaining === 1 ? '' : 's'}, or regenerate anyway.`
          : 'Using the cached summary — no new check-ins since last time.',
      )
    } else if (result.noFindings) {
      setMessage('Not enough data yet for an AI summary — keep logging.')
    }
  }

  const groups = buildGroups(patterns?.correlations ?? [], patterns?.moodImpacts ?? [])
  const aiSummaries = insights?.filter((i) => i.kind === 'AI_SUMMARY' && !i.dismissed) ?? []
  const isLoading = patternsLoading || insightsLoading

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Insights</h1>
          <p className="mt-1 text-slate-500">Patterns detected in your data.</p>
        </div>
        <button
          type="button"
          onClick={() => handleGenerate(false)}
          disabled={generate.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {generate.isPending ? 'Generating...' : 'AI summary'}
        </button>
      </div>

      {message && (
        <div className="mt-4 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>{message}</span>
          <button type="button" onClick={() => handleGenerate(true)} className="font-medium underline">
            Regenerate
          </button>
        </div>
      )}

      {generate.isError && (
        <p className="mt-4 text-sm text-red-600">Couldn't generate AI summary. Check that ANTHROPIC_API_KEY is set on the backend.</p>
      )}

      {isLoading && <p className="mt-6 text-sm text-slate-500">Loading...</p>}

      {!isLoading && groups.length === 0 && aiSummaries.length === 0 && (
        <div className="mt-8 text-center">
          <p className="text-sm text-slate-500">No patterns found yet.</p>
          <p className="mt-1 text-xs text-slate-400">
            Log check-ins with the same tags for at least 7 days — the more consistent your logging, the earlier patterns appear.
          </p>
        </div>
      )}

      {groups.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Detected patterns</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((g) => (
              <TriggerCard key={g.inputLabel} group={g} />
            ))}
          </div>
        </section>
      )}

      {aiSummaries.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">AI summary</h2>
          <div className="space-y-3">
            {aiSummaries.map((insight) => (
              <div key={insight.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs text-slate-400">{new Date(insight.generatedAt).toLocaleDateString()}</span>
                  <button
                    type="button"
                    onClick={() => dismiss.mutate(insight.id)}
                    className="text-xs text-slate-400 hover:text-slate-600"
                  >
                    Dismiss
                  </button>
                </div>
                <AiSummaryCard content={insight.content} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
