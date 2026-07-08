import crypto from 'node:crypto'
import { prisma } from '../db/client.js'
import { getClaudeClient, CLAUDE_MODEL } from './claude.js'
import { buildDayRecords, buildPeriodRecords } from './dayAggregation.js'
import {
  computeCorrelations,
  computeLaggedCorrelations,
  computeMoodImpacts,
  computePeriodCorrelations,
  computePeriodMoodImpacts,
  type CorrelationFinding,
  type MoodFinding,
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

async function cacheFindings<T extends Finding>(
  findings: T[],
  hashPrefix: string,
  keyOf: (finding: T) => string,
  since: Date,
  checkInCount: number,
  userId: string,
) {
  const created = []
  for (const finding of findings) {
    const inputHash = hash(`${hashPrefix}:${keyOf(finding)}`)
    const existing = await prisma.insight.findFirst({ where: { kind: 'CORRELATION', inputHash, userId } })
    if (existing) continue

    created.push(
      await prisma.insight.create({
        data: {
          userId,
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

export async function generateInsights(opts: { force?: boolean; userId: string }) {
  const { userId } = opts
  const since = new Date()
  since.setDate(since.getDate() - LOOKBACK_DAYS)

  const checkIns = await prisma.checkIn.findMany({
    where: { userId, occurredAt: { gte: since } },
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
  const laggedFindings = computeLaggedCorrelations(days)

  const createdCorrelationInsights = [
    ...(await cacheFindings(findings, 'correlation', (f) => `${f.inputLabel}:${f.outcomeLabel}`, since, checkInCount, userId)),
    ...(await cacheFindings(moodFindings, 'mood', (f) => f.inputLabel, since, checkInCount, userId)),
    ...(await cacheFindings(
      periodFindings,
      'period-correlation',
      (f) => `${f.context}:${f.inputLabel}:${f.outcomeLabel}`,
      since,
      checkInCount,
      userId,
    )),
    ...(await cacheFindings(
      periodMoodFindings,
      'period-mood',
      (f) => `${f.context}:${f.inputLabel}`,
      since,
      checkInCount,
      userId,
    )),
    ...(await cacheFindings(laggedFindings, 'lagged', (f) => `${f.inputLabel}:${f.outcomeLabel}`, since, checkInCount, userId)),
  ]

  const lastSummary = await prisma.insight.findFirst({
    where: { kind: 'AI_SUMMARY', userId },
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

  const allFindings = [...findings, ...periodFindings, ...laggedFindings]

  const allFindingSummaries = [
    ...findings.map((f) => f.summary),
    ...moodFindings.map((f) => f.summary),
    ...periodFindings.map((f) => f.summary),
    ...periodMoodFindings.map((f) => f.summary),
    ...laggedFindings.map((f) => f.summary),
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

  const confoundedFindings = allFindings.filter((f) => 'confounded' in f && f.confounded)
  const tentativeFindings = allFindings.filter((f) => 'tentative' in f && (f as { tentative?: boolean }).tentative)

  const confoundNotes =
    confoundedFindings.length > 0
      ? confoundedFindings
          .map((f) => {
            const cf = (f as { confounded?: { coOccursWith: string; isolatedDays: number; isolatedRate: number | null } }).confounded!
            return `  - "${(f as { inputLabel: string }).inputLabel}" always co-occurs with "${cf.coOccursWith}" (${cf.isolatedDays} isolated days${cf.isolatedRate != null ? `, isolated rate: ${Math.round(cf.isolatedRate * 100)}%` : ', too few to isolate'})`
          })
          .join('\n')
      : '(none)'

  const findingsText = allFindingSummaries.map((s) => `- ${s}`).join('\n')

  const client = getClaudeClient()
  const response = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: [
      'You are a health-pattern analyst reviewing a personal health tracker. This app tracks HABITS — recurring behaviors the person controls — and their effect on health outcomes. Pick 2–3 findings worth acting on, in ~150 words total.',
      '',
      'HABITS TO SURFACE:',
      '- Correlations where the magnitude in their own data is notable — quote the actual numbers.',
      '- Tentative findings (fewer than 8 exposure days): caveat with "early signal — keep logging".',
      '- Confounded findings (two habits almost always co-occur): note the ambiguity and suggest logging them separately to disambiguate.',
      '- Time-of-day carryover: evening habit → next morning outcome.',
      '',
      'IGNORE:',
      '- Reverse causation: nap → tired, medication → feeling unwell, any input clearly logged because the person already felt bad.',
      '- One-off external events the person cannot repeat or avoid.',
      '',
      'FORMAT RULES:',
      '1. "boosts" and "drags": only findings from the verified statistical list. Quote numbers.',
      '2. "notes": only non-obvious observations (e.g. an expected effect that is absent, a confound worth untangling). Leave empty if nothing qualifies.',
      '3. Association language only — "appears linked to", "on days with X, Y was more common" — never "causes".',
      '4. One sharp insight beats five vague ones.',
    ].join('\n'),
    tools: [insightToolSchema],
    tool_choice: { type: 'tool', name: INSIGHT_TOOL_NAME },
    messages: [
      {
        role: 'user',
        content: [
          `Total check-ins: ${checkInCount}`,
          '',
          'Verified statistical findings (Fisher\'s exact test, BH-corrected):',
          findingsText,
          '',
          tentativeFindings.length > 0
            ? `Tentative findings (< 8 exposure days, treat cautiously):\n${tentativeFindings.map((f) => `  - ${(f as { inputLabel: string }).inputLabel}`).join('\n')}`
            : '',
          '',
          confoundedFindings.length > 0 ? `Potential confounds (two habits almost always co-occur):\n${confoundNotes}` : '',
          '',
          'Journal excerpts:',
          journalSnippets.join('\n') || '(none)',
          '',
          'Give 2-3 actionable findings (~150 words). Flag tentative signals. For confounds, suggest how to log separately to disambiguate.',
        ]
          .filter(Boolean)
          .join('\n'),
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
      userId,
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

export async function getPatterns(userId: string) {
  const since = new Date()
  since.setDate(since.getDate() - LOOKBACK_DAYS)

  const checkIns = await prisma.checkIn.findMany({
    where: { userId, occurredAt: { gte: since } },
    include: { tags: { include: { tag: true } }, events: true },
    orderBy: { occurredAt: 'asc' },
  })

  const days = buildDayRecords(checkIns)
  const periods = buildPeriodRecords(checkIns)

  const allCorrelations = [...computeCorrelations(days), ...computePeriodCorrelations(periods), ...computeLaggedCorrelations(days)]
  const allMoodImpacts = [...computeMoodImpacts(days), ...computePeriodMoodImpacts(periods)]

  return {
    correlations: deduplicateFindings(allCorrelations, (f) => `${f.inputLabel}:${f.outcomeLabel}`, (f) => Math.abs(f.lift) * Math.sqrt(Math.min(f.daysWithInput, f.daysWithoutInput))),
    moodImpacts: deduplicateFindings(allMoodImpacts, (f) => f.inputLabel, (f) => Math.abs(f.diff) * Math.sqrt(Math.min(f.daysWithInput, f.daysWithoutInput))),
    checkInCount: checkIns.length,
  }
}

function deduplicateFindings<T>(items: T[], key: (item: T) => string, score: (item: T) => number): T[] {
  const best = new Map<string, T>()
  for (const item of items) {
    const k = key(item)
    const existing = best.get(k)
    if (!existing || score(item) > score(existing)) best.set(k, item)
  }
  return [...best.values()]
}
