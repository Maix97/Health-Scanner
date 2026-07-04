import { useState } from 'react'
import InsightCard from '../components/InsightCard'
import { useDismissInsight, useGenerateInsights, useInsights } from '../hooks/useInsights'

export default function Insights() {
  const { data: insights, isLoading } = useInsights()
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
      setMessage('Not enough data yet for an AI summary — keep logging. The app needs at least 10 days of check-ins with the same tags appearing 5+ times before patterns can be detected.')
    } else if (result.createdCorrelationInsights.length === 0 && !result.aiSummary) {
      setMessage('Not enough data yet — keep logging check-ins to unlock patterns.')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Insights</h1>
          <p className="mt-1 text-slate-500">Patterns detected in your data, plus AI-generated summaries.</p>
        </div>
        <button
          type="button"
          onClick={() => handleGenerate(false)}
          disabled={generate.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {generate.isPending ? 'Generating...' : 'Generate insights'}
        </button>
      </div>

      {message && (
        <div className="mt-4 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>{message}</span>
          <button type="button" onClick={() => handleGenerate(true)} className="font-medium underline">
            Regenerate anyway
          </button>
        </div>
      )}

      {generate.isError && (
        <p className="mt-4 text-sm text-red-600">Couldn't generate insights. Check that ANTHROPIC_API_KEY is set on the backend.</p>
      )}

      {isLoading && <p className="mt-4 text-sm text-slate-500">Loading...</p>}

      {insights && insights.length === 0 && !isLoading && (
        <p className="mt-6 text-sm text-slate-500">
          No insights yet. Log at least 10 check-ins, then click "Generate insights" to look for patterns.
        </p>
      )}

      <div className="mt-4 space-y-3">
        {insights?.map((insight) => (
          <InsightCard key={insight.id} insight={insight} onDismiss={(id) => dismiss.mutate(id)} />
        ))}
      </div>
    </div>
  )
}
