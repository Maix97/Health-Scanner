import type { AiSummaryContent, Insight } from '../types'

interface InsightCardProps {
  insight: Insight
  onDismiss: (id: string) => void
}

function AiSummaryList({ title, items, tone }: { title: string; items: string[]; tone: 'good' | 'bad' | 'neutral' }) {
  if (items.length === 0) return null
  const dotClass = tone === 'good' ? 'bg-emerald-500' : tone === 'bad' ? 'bg-red-500' : 'bg-slate-400'

  return (
    <div className="mt-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <ul className="mt-1 space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function InsightCard({ insight, onDismiss }: InsightCardProps) {
  const isAiSummary = insight.kind === 'AI_SUMMARY'
  let summary: AiSummaryContent | null = null
  if (isAiSummary) {
    try {
      summary = JSON.parse(insight.content)
    } catch {
      summary = null
    }
  }

  return (
    <div className="relative rounded-md border border-slate-200 bg-white p-4">
      <button
        type="button"
        onClick={() => onDismiss(insight.id)}
        className="absolute right-3 top-3 text-slate-400 hover:text-slate-700"
        aria-label="Dismiss"
      >
        ×
      </button>

      <span
        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
          isAiSummary ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'
        }`}
      >
        {isAiSummary ? 'AI summary' : 'Pattern'}
      </span>

      {isAiSummary && summary ? (
        <div>
          <AiSummaryList title="Boosting" items={summary.boosts} tone="good" />
          <AiSummaryList title="Dragging down" items={summary.drags} tone="bad" />
          <AiSummaryList title="Notes" items={summary.notes} tone="neutral" />
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-700">{insight.content}</p>
      )}
    </div>
  )
}
