import crypto from 'node:crypto'
import { prisma } from '../db/client.js'
import { getClaudeClient, CLAUDE_MODEL } from './claude.js'
import { buildDayRecords, buildPeriodRecords } from './dayAggregation.js'
import {
  computeCorrelations,
  computeMoodImpacts,
  computePeriodCorrelations,
  computePeriodMoodImpacts,
} from './correlation.js'
import { INSIGHT_TOOL_NAME, insightResultSchema, insightToolSchema } from '../schemas/insights.js'

const LOOKBACK_DAYS = 90
const MIN_NEW_CHECKINS = Number(process.env.INSIGHT_MIN_NEW_CHECKINS ?? 3)
const MAX_JOURNAL_SNIPPETS = 6

function hash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}

interface Finding {
  summary: string
}

// Caches one Insight row per distinct finding (keyed by a hash prefix unique
// to the finding kind), skipping ones already recorded — even if dismissed —
// so a dismissed finding doesn't reappear on every regenerate.
async function cacheFindings<T extends Finding>(
  findings: T[],
  hashPrefix: string,
  keyOf: (finding: T) => string,
  since: Date,
  checkInCount: number,
) {
  const created = []
  for (const finding of findings) {
    const inputHash = hash(`${hashPrefix}:${keyOf(finding)}`)
    const existing = await prisma.insight.findFirst({ where: { kind: 'CORRELATION', inputHash } })
    if (existing) continue

    created.push(
      await prisma.insight.create({
        data: {
          kind: 'CORRELATION',
          inputHash,
          content: finding.summary,
          periodStart: since,
          periodEnd: new Date(),
          checkInCountAtGeneration: checkInCount,
        },
      }),
    )
  }
  return created
}

export async function generateInsights(opts: { force?: boolean } = {}) {
  const since = new Date()
  since.setDate(since.getDate() - LOOKBACK_DAYS)

  const checkIns = await prisma.checkIn.findMany({
    where: { occurredAt: { gte: since } },
    include: { tags: { include: { tag: true } }, events: true },
    orderBy: { occurredAt: 'asc' },
  })

  const checkInCount = checkIns.length
  const days = buildDayRecords(checkIns)
  const periods = buildPeriodRecords(checkIns)

  const findings = computeCorrelations(days)
  const moodFindings = computeMoodImpacts(days)
  const periodFindings = computePeriodCorrelations(periods)
  const periodMoodFindings = computePeriodMoodImpacts(periods)

  const createdCorrelationInsights = [
    ...(await cacheFindings(findings, 'correlation', (f) => `${f.inputLabel}:${f.outcomeLabel}`, since, checkInCount)),
    ...(await cacheFindings(moodFindings, 'mood', (f) => f.inputLabel, since, checkInCount)),
    ...(await cacheFindings(
      periodFindings,
      'period-correlation',
      (f) => `${f.context}:${f.inputLabel}:${f.outcomeLabel}`,
      since,
      checkInCount,
    )),
    ...(await cacheFindings(
      periodMoodFindings,
      'period-mood',
      (f) => `${f.context}:${f.inputLabel}`,
      since,
      checkInCount,
    )),
  ]

  const lastSummary = await prisma.insight.findFirst({
    where: { kind: 'AI_SUMMARY' },
    orderBy: { generatedAt: 'desc' },
  })

  const newCheckInsSinceLastGeneration = checkInCount - (lastSummary?.checkInCountAtGeneration ?? 0)

  if (!opts.force && lastSummary && newCheckInsSinceLastGeneration < MIN_NEW_CHECKINS) {
    return {
      cached: true as const,
      checkInCount,
      newCheckInsSinceLastGeneration,
      minNewCheckIns: MIN_NEW_CHECKINS,
      createdCorrelationInsights,
      aiSummary: null,
    }
  }

  const allFindingSummaries = [
    ...findings.map((f) => f.summary),
    ...moodFindings.map((f) => f.summary),
    ...periodFindings.map((f) => f.summary),
    ...periodMoodFindings.map((f) => f.summary),
  ]

  if (allFindingSummaries.length === 0) {
    return {
      cached: false as const,
      checkInCount,
      createdCorrelationInsights,
      aiSummary: null,
      noFindings: true as const,
    }
  }

  const journalSnippets = checkIns
    .filter((c) => c.journalText?.trim())
    .sort((a, b) => (b.journalText?.length ?? 0) - (a.journalText?.length ?? 0))
    .slice(0, MAX_JOURNAL_SNIPPETS)
    .map((c) => `${c.occurredAt.toISOString().slice(0, 10)}: ${c.journalText}`)

  const findingsText = allFindingSummaries.map((s) => `- ${s}`).join('\n')

  const client = getClaudeClient()
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: [
      'You are a health-pattern analyst reviewing a personal health tracker. This app tracks HABITS — recurring behaviors the person controls — and their effect on health outcomes. Your job is to surface what is specific, data-backed, and actionable for this person.',
      '',
      'THE CORE DISTINCTION — habits vs one-off events:',
      'Surface findings about HABITS (alcohol consumption, coffee, food choices, exercise, sleep schedule, screen time, etc.) even when the direction of the effect is "expected" — because the value is in the person\'s specific numbers and magnitude, not in discovering that the relationship exists.',
      'DO NOT surface findings driven by one-off external events the person cannot control or change (a single night flight, a single stressful trip, exceptional work deadline, unusual travel disruption). The statistical engine requires 5+ occurrences, so true one-offs will not appear — but if journal context suggests a finding is driven by a single unusual event rather than a recurring habit, note that caveat instead of presenting it as a pattern.',
      '',
      'REVERSE CAUSATION — ignore these directions:',
      '- Nap during the day → tiredness: the nap IS the tiredness response, not its cause.',
      '- Taking medication → feeling unwell: medication is a response to illness, not a cause.',
      '- Any clear case where the "input" tag was logged because the person already felt bad.',
      '',
      'WHAT TO SURFACE:',
      '- Habit correlations even when directionally expected, IF the magnitude in their own data is notable (e.g. "alcohol appears linked to poor sleep in your data — on those days sleep score averaged 1.8 vs 3.9 otherwise").',
      '- When an expected effect does NOT appear in their data — absence of a correlation is also informative (e.g. "coffee does not appear linked to your sleep quality based on your entries").',
      '- Specific sub-items over parent categories: "pizza" rather than "junk food", "ice cream" rather than "sweets", "beer" rather than "alcohol" if tracked separately.',
      '- Time-of-day carryover: evening habit X → next morning outcome Y.',
      '- Findings labelled "tentative": caveat with "early signal — keep logging to confirm".',
      '',
      'RULES:',
      '1. "boosts" and "drags": only include findings from the verified statistical list. Quote the actual numbers.',
      '2. "notes": only for non-obvious or surprising observations. Leave empty if nothing qualifies.',
      '3. Phrase as association not causation: "appears linked to", "on days with X, Y was more common" — never "causes" or "leads to".',
      '4. Only compare this person against their own data — never invent population averages.',
      '5. One sharp specific insight is worth more than five vague ones.',
    ].join('\n'),
    tools: [insightToolSchema],
    tool_choice: { type: 'tool', name: INSIGHT_TOOL_NAME },
    messages: [
      {
        role: 'user',
        content: `Total check-ins in dataset: ${checkInCount}\n\nVerified statistical findings:\n${findingsText}\n\nJournal excerpts:\n${journalSnippets.join('\n') || '(none)'}\n\nWhat is genuinely specific or surprising about this person's patterns? Focus on magnitude, unexpected absences, and specific items — not general health advice. Caveat any tentative findings.`,
      },
    ],
  })

  const toolUse = response.content.find((block) => block.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Claude did not return a tool_use block for insights')
  }

  const parsed = insightResultSchema.parse(toolUse.input)
  const inputHash = hash(`ai_summary:${checkInCount}:${allFindingSummaries.join('|')}`)

  const aiSummary = await prisma.insight.create({
    data: {
      kind: 'AI_SUMMARY',
      inputHash,
      content: JSON.stringify(parsed),
      periodStart: since,
      periodEnd: new Date(),
      checkInCountAtGeneration: checkInCount,
    },
  })

  return {
    cached: false as const,
    checkInCount,
    createdCorrelationInsights,
    aiSummary,
  }
}
