import { useState } from 'react'
import { useGenerateInsights, useInsights, usePatterns } from '../hooks/useInsights'
import type { AiSummaryContent, CorrelationFinding, MoodFinding } from '../types'

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const EMOJI_RULES: [RegExp, string][] = [
  [/coffee|espresso|latte|cappuccino/, '☕'],
  [/alcohol|beer|wine|spirits|vodka|whiskey/, '🍷'],
  [/exercise|workout|gym|run|jog|cycling|swim|sport/, '🏃'],
  [/sweet|sugar|candy|chocolate|dessert|ice.?cream/, '🍬'],
  [/sandwich|bread|toast|bagel/, '🥪'],
  [/pizza/, '🍕'],
  [/vegetable|salad|greens|broccoli|spinach|veggie/, '🥗'],
  [/meat|chicken|beef|pork|steak|minced/, '🥩'],
  [/fruit|apple|banana|berry|orange/, '🍎'],
  [/water|hydrat/, '💧'],
  [/stress/, '😰'],
  [/meditation|yoga|mindful/, '🧘'],
  [/dairy|milk|cheese/, '🥛'],
  [/egg/, '🥚'],
  [/fish|seafood|salmon/, '🐟'],
  [/burger|fast.?food/, '🍔'],
  [/pasta|noodle|rice/, '🍝'],
  [/walk/, '🚶'],
  [/sleep/, '😴'],
]

function getEmoji(label: string): string {
  const l = label.toLowerCase()
  for (const [re, emoji] of EMOJI_RULES) {
    if (re.test(l)) return emoji
  }
  return ''
}

// ─── Data model ──────────────────────────────────────────────────────────────

interface TriggerGroup {
  inputLabel: string
  emoji: string
  correlations: CorrelationFinding[]
  moodImpact: MoodFinding | undefined
  column: 'helping' | 'hurting'
  allConfounded: boolean
  badge: 'strong' | 'tentative' | 'confounded' | null
  dominantScore: number
}

function buildGroups(correlations: CorrelationFinding[], moodImpacts: MoodFinding[]): TriggerGroup[] {
  const map = new Map<string, TriggerGroup>()

  for (const f of correlations) {
    if (!map.has(f.inputLabel)) {
      map.set(f.inputLabel, {
        inputLabel: f.inputLabel,
        emoji: getEmoji(f.inputLabel),
        correlations: [],
        moodImpact: undefined,
        column: 'hurting',
        allConfounded: false,
        badge: null,
        dominantScore: 0,
      })
    }
    map.get(f.inputLabel)!.correlations.push(f)
  }

  for (const f of moodImpacts) {
    if (!map.has(f.inputLabel)) {
      map.set(f.inputLabel, {
        inputLabel: f.inputLabel,
        emoji: getEmoji(f.inputLabel),
        correlations: [],
        moodImpact: undefined,
        column: 'hurting',
        allConfounded: false,
        badge: null,
        dominantScore: 0,
      })
    }
    map.get(f.inputLabel)!.moodImpact = f
  }

  const groups = [...map.values()]

  for (const g of groups) {
    let helpScore = 0
    let hurtScore = 0
    for (const c of g.correlations) {
      const w = Math.abs(c.lift)
      if (c.beneficial) helpScore += w
      else hurtScore += w
    }
    if (g.moodImpact) {
      const norm = Math.abs(g.moodImpact.diff) / 9
      if (g.moodImpact.diff > 0) helpScore += norm
      else hurtScore += norm
    }
    g.column = helpScore >= hurtScore ? 'helping' : 'hurting'
    g.dominantScore = Math.max(helpScore, hurtScore)

    g.allConfounded =
      g.correlations.length > 0 &&
      g.correlations.every((c) => c.confounded) &&
      !g.moodImpact

    const nonConfounded = g.correlations.filter((c) => !c.confounded)
    const hasConfound = g.correlations.some((c) => c.confounded)
    if (hasConfound && nonConfounded.length === 0 && !g.moodImpact) {
      g.badge = 'confounded'
    } else if (nonConfounded.length > 0 && nonConfounded.every((c) => c.tentative) && !g.moodImpact) {
      g.badge = 'tentative'
    } else if (nonConfounded.some((c) => !c.tentative && c.daysWithInput >= 15)) {
      g.badge = 'strong'
    }
  }

  return groups.sort((a, b) => b.dominantScore - a.dominantScore)
}

// ─── Visual primitives ────────────────────────────────────────────────────────

function CompRow({
  barValue,
  displayLabel,
  activeColor,
  rowLabel,
}: {
  barValue: number
  displayLabel: string
  activeColor: string
  rowLabel: string
}) {
  const pct = Math.max(0, Math.min(1, barValue)) * 100
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-9 shrink-0 text-right text-[10px] text-slate-400">{rowLabel}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: activeColor }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-[10px] font-medium" style={{ color: activeColor }}>
        {displayLabel}
      </span>
    </div>
  )
}

function GrayRow({
  barValue,
  displayLabel,
  rowLabel,
}: {
  barValue: number
  displayLabel: string
  rowLabel: string
}) {
  const pct = Math.max(0, Math.min(1, barValue)) * 100
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-9 shrink-0 text-right text-[10px] text-slate-400">{rowLabel}</span>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="absolute inset-y-0 left-0 rounded-full bg-slate-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-[10px] font-medium text-slate-400">{displayLabel}</span>
    </div>
  )
}

// ─── Outcome rows ─────────────────────────────────────────────────────────────

function CorrelationRow({ f }: { f: CorrelationFinding }) {
  const color = f.beneficial ? '#10b981' : '#f43f5e'
  const withPct = Math.round(f.rateWithInput * 100)
  const withoutPct = Math.round(f.rateWithoutInput * 100)
  return (
    <div className="py-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-slate-600">{cap(f.outcomeLabel)}</span>
        <div className="flex shrink-0 gap-1">
          {f.lagged && (
            <span className="rounded border border-violet-200 bg-violet-50 px-1 py-0.5 text-[9px] font-medium text-violet-600">
              ⏱{f.lagged.bestLag != null ? ` ${f.lagged.bestLag}d` : ' delayed'}
            </span>
          )}
          {f.tentative && (
            <span className="rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[9px] font-medium text-amber-600">
              early
            </span>
          )}
          {f.confounded && (
            <span className="rounded border border-orange-200 bg-orange-50 px-1 py-0.5 text-[9px] font-medium text-orange-600">
              mixed
            </span>
          )}
        </div>
      </div>
      <div className="space-y-0.5">
        <CompRow barValue={f.rateWithInput} displayLabel={`${withPct}%`} activeColor={color} rowLabel="with" />
        <GrayRow barValue={f.rateWithoutInput} displayLabel={`${withoutPct}%`} rowLabel="w/out" />
      </div>
      {f.confounded?.isolatedRate != null && (
        <p className="mt-1 text-[10px] text-orange-500">
          Alone ({f.confounded.isolatedDays}d): {Math.round(f.confounded.isolatedRate * 100)}% — usually logged with {f.confounded.coOccursWith}
        </p>
      )}
    </div>
  )
}

function MoodRow({ f }: { f: MoodFinding }) {
  const positive = f.diff > 0
  const color = positive ? '#10b981' : '#f43f5e'
  const rateWith = (f.avgMoodWithInput - 1) / 9
  const rateWithout = (f.avgMoodWithoutInput - 1) / 9
  return (
    <div className="py-2">
      <div className="mb-1">
        <span className="text-xs font-medium text-slate-600">Mood</span>
      </div>
      <div className="space-y-0.5">
        <CompRow barValue={rateWith} displayLabel={`${f.avgMoodWithInput.toFixed(1)}/10`} activeColor={color} rowLabel="with" />
        <GrayRow barValue={rateWithout} displayLabel={`${f.avgMoodWithoutInput.toFixed(1)}/10`} rowLabel="w/out" />
      </div>
      <p className="mt-0.5 text-[10px] text-slate-400">
        {positive ? '+' : ''}{f.diff.toFixed(1)} pts avg · n={f.daysWithInput}
      </p>
    </div>
  )
}

// ─── Card & badge ─────────────────────────────────────────────────────────────

function CardBadge({ badge }: { badge: TriggerGroup['badge'] }) {
  if (!badge) return null
  if (badge === 'strong')
    return <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Strong</span>
  if (badge === 'tentative')
    return <span className="rounded border border-amber-200 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">Tentative</span>
  return <span className="rounded border border-orange-200 px-1.5 py-0.5 text-[10px] font-medium text-orange-600">Confounded</span>
}

function TriggerCard({ group }: { group: TriggerGroup }) {
  const isHelping = group.column === 'helping'
  const labelColor = isHelping ? 'text-emerald-700' : 'text-rose-700'
  const borderColor = isHelping ? 'border-emerald-100' : 'border-rose-100'

  const sortedCorr = [...group.correlations].sort((a, b) => {
    if (!!a.confounded !== !!b.confounded) return a.confounded ? 1 : -1
    return Math.abs(b.lift) - Math.abs(a.lift)
  })

  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${borderColor}`}>
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {group.emoji && <span className="text-base leading-none">{group.emoji}</span>}
          <span className={`text-sm font-semibold ${labelColor}`}>{cap(group.inputLabel)}</span>
        </div>
        <CardBadge badge={group.badge} />
      </div>
      <div className="divide-y divide-slate-100">
        {group.moodImpact && <MoodRow f={group.moodImpact} />}
        {sortedCorr.map((f, i) => (
          <CorrelationRow key={i} f={f} />
        ))}
      </div>
    </div>
  )
}

// ─── Column ───────────────────────────────────────────────────────────────────

const TOP_N = 5

function Column({
  title,
  color,
  groups,
  emptyText,
}: {
  title: string
  color: 'green' | 'red'
  groups: TriggerGroup[]
  emptyText: string
}) {
  const [showAll, setShowAll] = useState(false)
  const visible = showAll ? groups : groups.slice(0, TOP_N)
  const titleColor = color === 'green' ? 'text-emerald-700' : 'text-rose-700'
  const pillColor = color === 'green' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h2 className={`text-sm font-semibold ${titleColor}`}>{title}</h2>
        {groups.length > 0 && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${pillColor}`}>{groups.length}</span>
        )}
      </div>
      {groups.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-400">{emptyText}</p>
      ) : (
        <div className="space-y-3">
          {visible.map((g) => (
            <TriggerCard key={g.inputLabel} group={g} />
          ))}
          {groups.length > TOP_N && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full rounded-lg border border-dashed border-slate-200 py-2 text-xs text-slate-400 hover:border-slate-300 hover:text-slate-500"
            >
              {showAll ? 'Show less' : `Show ${groups.length - TOP_N} more`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Confounded card ──────────────────────────────────────────────────────────

function ConfoundedCard({ groups }: { groups: TriggerGroup[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-orange-100 bg-orange-50 p-4">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-base">⚠️</span>
        <span className="flex-1 text-sm font-medium text-orange-800">
          Can't separate yet ({groups.length} factor{groups.length !== 1 ? 's' : ''})
        </span>
        <span className="text-xs text-orange-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ul className="mt-3 space-y-2 border-t border-orange-200 pt-3">
          {groups.map((g) => {
            const coOccursWith = g.correlations[0]?.confounded?.coOccursWith
            return (
              <li key={g.inputLabel} className="text-xs text-orange-700">
                {g.emoji && <span className="mr-1">{g.emoji}</span>}
                <span className="font-medium">{cap(g.inputLabel)}</span>
                {coOccursWith && (
                  <span className="text-orange-500">
                    {' '}always logged together with{' '}
                    <span className="font-medium">{coOccursWith}</span>
                    {' '}— try logging them on separate days to untangle the effect
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Headline strip ───────────────────────────────────────────────────────────

function HeadlineStrip({ groups }: { groups: TriggerGroup[] }) {
  type Headline = { text: string; beneficial: boolean }
  const headlines: Headline[] = []

  for (const g of groups) {
    if (headlines.length >= 3) break
    if (g.allConfounded) continue

    const best = [...g.correlations]
      .filter((c) => !c.confounded && !c.tentative)
      .sort((a, b) => Math.abs(b.lift) - Math.abs(a.lift))[0]

    if (best) {
      const pct = Math.round(best.rateWithInput * 100)
      const prefix = g.emoji ? `${g.emoji} ` : ''
      headlines.push({
        text: `${prefix}${cap(g.inputLabel)} → ${best.outcomeLabel} on ${pct}% of days`,
        beneficial: best.beneficial,
      })
      continue
    }

    if (g.moodImpact && Math.abs(g.moodImpact.diff) >= 1.5) {
      const { diff } = g.moodImpact
      const prefix = g.emoji ? `${g.emoji} ` : ''
      headlines.push({
        text: `${prefix}${cap(g.inputLabel)} → mood ${diff > 0 ? '+' : ''}${diff.toFixed(1)} pts avg`,
        beneficial: diff > 0,
      })
    }
  }

  if (headlines.length === 0) return null

  return (
    <div className="mb-6 rounded-xl border border-slate-100 bg-slate-50 p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Top findings</p>
      <ul className="space-y-2.5">
        {headlines.map((h, i) => (
          <li key={i} className="flex items-center gap-2.5">
            <span
              className={`shrink-0 text-sm font-bold ${h.beneficial ? 'text-emerald-500' : 'text-rose-500'}`}
            >
              {h.beneficial ? '↑' : '↓'}
            </span>
            <span className="text-sm font-medium text-slate-800">{h.text}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─── AI analysis panel ────────────────────────────────────────────────────────

function AiPanel({ aiContent, generatedAt }: { aiContent: string; generatedAt: string }) {
  const [open, setOpen] = useState(false)
  let parsed: AiSummaryContent | null = null
  try { parsed = JSON.parse(aiContent) } catch {}

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-sm font-semibold text-slate-700">Full AI analysis</span>
        <span className="text-xs text-slate-400">{open ? '▲ collapse' : '▼ expand'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4">
          {parsed ? (
            <div className="space-y-4 text-sm">
              {parsed.boosts.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-emerald-600">Boosting</p>
                  <ul className="space-y-1.5">
                    {parsed.boosts.map((b, i) => (
                      <li key={i} className="flex gap-2 text-slate-600">
                        <span className="mt-0.5 shrink-0 text-emerald-500">↑</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {parsed.drags.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-rose-600">Dragging</p>
                  <ul className="space-y-1.5">
                    {parsed.drags.map((d, i) => (
                      <li key={i} className="flex gap-2 text-slate-600">
                        <span className="mt-0.5 shrink-0 text-rose-400">↓</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {parsed.notes.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-400">Notes</p>
                  <ul className="space-y-1.5">
                    {parsed.notes.map((n, i) => (
                      <li key={i} className="text-slate-500">{n}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="whitespace-pre-wrap text-sm text-slate-600">{aiContent}</p>
          )}
          <p className="mt-4 text-xs text-slate-300">
            Generated {new Date(generatedAt).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Insights() {
  const { data: insights = [], isLoading: insightsLoading } = useInsights()
  const { data: patterns, isLoading: patternsLoading } = usePatterns()
  const generate = useGenerateInsights()
  const [message, setMessage] = useState<string | null>(null)

  async function handleGenerate(force = false) {
    setMessage(null)
    const result = await generate.mutateAsync(force)
    if (result.cached) {
      const remaining = (result.minNewCheckIns ?? 0) - (result.newCheckInsSinceLastGeneration ?? 0)
      setMessage(
        remaining > 0
          ? `Log ${remaining} more check-in${remaining === 1 ? '' : 's'} for a fresh AI summary, or regenerate anyway.`
          : 'Using cached summary — no new check-ins since last time.',
      )
    } else if (result.noFindings) {
      setMessage('Not enough data yet — keep logging.')
    }
  }

  const groups = buildGroups(patterns?.correlations ?? [], patterns?.moodImpacts ?? [])
  const helpingGroups = groups.filter((g) => !g.allConfounded && g.column === 'helping')
  const hurtingGroups = groups.filter((g) => !g.allConfounded && g.column === 'hurting')
  const confoundedGroups = groups.filter((g) => g.allConfounded)
  const latestAi = insights.find((i) => i.kind === 'AI_SUMMARY' && !i.dismissed)
  const isLoading = patternsLoading || insightsLoading

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Insights</h1>
          <p className="mt-1 text-slate-500">Patterns in your data.</p>
        </div>
        <button
          type="button"
          onClick={() => handleGenerate(false)}
          disabled={generate.isPending}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {generate.isPending ? 'Analysing...' : 'AI summary'}
        </button>
      </div>

      {message && (
        <div className="mt-4 flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          <span>{message}</span>
          <button type="button" onClick={() => handleGenerate(true)} className="ml-4 shrink-0 font-medium underline">
            Regenerate
          </button>
        </div>
      )}

      {generate.isError && (
        <p className="mt-4 text-sm text-red-600">
          Couldn't generate AI summary — check that ANTHROPIC_API_KEY is set on the backend.
        </p>
      )}

      {isLoading && <p className="mt-6 text-sm text-slate-500">Loading...</p>}

      {!isLoading && groups.length === 0 && (
        <div className="mt-10 text-center">
          <p className="text-sm text-slate-500">No patterns found yet.</p>
          <p className="mt-1 text-xs text-slate-400">
            Log check-ins with the same tags for at least 7 days — the more consistent your logging, the sooner patterns appear.
          </p>
        </div>
      )}

      {!isLoading && groups.length > 0 && (
        <div className="mt-6">
          <HeadlineStrip groups={groups} />

          <div className="grid gap-6 sm:grid-cols-2">
            <Column
              title="Helping you"
              color="green"
              groups={helpingGroups}
              emptyText="No positive patterns detected yet."
            />
            <Column
              title="Hurting you"
              color="red"
              groups={hurtingGroups}
              emptyText="No negative patterns detected yet."
            />
          </div>

          {confoundedGroups.length > 0 && (
            <div className="mt-4">
              <ConfoundedCard groups={confoundedGroups} />
            </div>
          )}
        </div>
      )}

      {latestAi && <AiPanel aiContent={latestAi.content} generatedAt={latestAi.generatedAt} />}
    </div>
  )
}
