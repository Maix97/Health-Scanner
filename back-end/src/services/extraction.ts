import { prisma } from '../db/client.js'
import { getClaudeClient, CLAUDE_MODEL } from './claude.js'
import {
  EXTRACTION_TOOL_NAME,
  extractionResultSchema,
  extractionToolSchema,
  labelsMatch,
} from '../schemas/extraction.js'

const MIN_EXTRACTION_CONFIDENCE = 0.5

const SYSTEM_PROMPT = `You extract discrete health-relevant events from a personal health journal entry.
Categories:
- FOOD: what was eaten, OR a meaningful dietary pattern. Prefer the higher-level pattern
  over a literal restatement when the text describes one — e.g. "only ate a little in the
  morning because I was fasting" -> label it "fasting", not "ate a little". Other pattern
  examples: "skipped breakfast", "ate out", "overate", "ate light".
- DRINK: anything consumed that is not solid food, e.g. "coffee", "beer", "water"
- ACTIVITY: physical activity or exercise, e.g. "running", "yoga", "walked the dog"
- SYMPTOM: a physical symptom or sensation in the user's OWN BODY, e.g. "headache",
  "nausea", "fatigue", "felt overheated". Do not extract incidental environmental context
  (room temperature, weather, surroundings) just because it's mentioned near a feeling —
  only extract it as a symptom if the user describes their own body reacting to it. E.g.
  "the room was a little hot but I still slept well" is NOT a symptom (it's scene-setting
  that didn't actually affect them); "I felt overheated and couldn't sleep" IS a symptom.
- MOOD: an emotional state mentioned, e.g. "happy", "anxious", "stressed"

Only extract what is stated or strongly implied in the text. Do not invent details that
aren't there. Skip incidental scene-setting (day of week, weather, logistics, surroundings)
that isn't itself a meaningful personal health signal. Use short, normalized, lowercase
labels (a word or short phrase, not a full sentence). Give a low confidence score (below
0.5) to vague, ambiguous, or borderline-irrelevant mentions — when in doubt, score it low
rather than omitting it entirely. The user may have already manually logged some of these
same things — that's fine, still report what you find in the text.`

export async function processJournalExtraction(checkInId: string): Promise<void> {
  const checkIn = await prisma.checkIn.findUnique({
    where: { id: checkInId },
    include: { tags: { include: { tag: true } }, events: true },
  })

  if (!checkIn || !checkIn.journalText?.trim()) return

  const manualLabels = [
    ...checkIn.tags.filter((t) => t.source === 'MANUAL').map((t) => t.tag.label),
    ...checkIn.events.filter((e) => e.source === 'MANUAL').map((e) => e.label),
  ]

  try {
    const client = getClaudeClient()
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [extractionToolSchema],
      tool_choice: { type: 'tool', name: EXTRACTION_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: [
            manualLabels.length > 0
              ? `The user already manually logged: ${manualLabels.join(', ')}.`
              : '',
            `Journal entry:\n${checkIn.journalText}`,
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
    })

    const toolUse = response.content.find((block) => block.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new Error('Claude did not return a tool_use block')
    }

    const parsed = extractionResultSchema.parse(toolUse.input)

    const insertedLabels: string[] = []
    for (const candidate of parsed.events) {
      if (candidate.confidence < MIN_EXTRACTION_CONFIDENCE) continue

      const isDuplicate =
        manualLabels.some((label) => labelsMatch(candidate.label, label)) ||
        insertedLabels.some((label) => labelsMatch(candidate.label, label))

      if (isDuplicate) continue

      await prisma.event.create({
        data: {
          checkInId,
          type: candidate.type,
          label: candidate.label.toLowerCase(),
          value: candidate.value,
          source: 'EXTRACTED',
          confidence: candidate.confidence,
          rawSpan: candidate.rawSpan,
        },
      })
      insertedLabels.push(candidate.label)
    }

    await prisma.checkIn.update({
      where: { id: checkInId },
      data: { journalProcessedAt: new Date() },
    })
  } catch (err) {
    console.error(`Journal extraction failed for check-in ${checkInId}:`, err)
  }
}
