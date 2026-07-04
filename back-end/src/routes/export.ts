import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client.js'

export const exportRouter = Router()

exportRouter.get('/export', async (_req, res) => {
  const [tags, checkIns] = await Promise.all([
    prisma.tag.findMany(),
    prisma.checkIn.findMany({
      include: { tags: true, events: true },
      orderBy: { occurredAt: 'asc' },
    }),
  ])

  res.json({
    exportedAt: new Date().toISOString(),
    tags,
    checkIns: checkIns.map((c) => ({
      id: c.id,
      occurredAt: c.occurredAt,
      timePeriod: c.timePeriod,
      sleepScore: c.sleepScore,
      wentToBedLate: c.wentToBedLate,
      sleepHours: c.sleepHours,
      moodScore: c.moodScore,
      energyScore: c.energyScore,
      journalText: c.journalText,
      journalProcessedAt: c.journalProcessedAt,
      tags: c.tags.map((t) => ({ tagId: t.tagId, source: t.source, intensity: t.intensity })),
      events: c.events.map((e) => ({
        type: e.type,
        label: e.label,
        value: e.value,
        source: e.source,
        confidence: e.confidence,
        rawSpan: e.rawSpan,
      })),
    })),
  })
})

const importBodySchema = z.object({
  mode: z.literal('replace'),
  tags: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      category: z.enum(['FEELING', 'QUICK_TOGGLE', 'EXERCISE', 'FOOD']),
      polarity: z.enum(['POSITIVE', 'NEGATIVE']).nullable().optional(),
      parentTagId: z.string().nullable().optional(),
      isPreset: z.boolean(),
    }),
  ),
  checkIns: z.array(
    z.object({
      id: z.string(),
      occurredAt: z.coerce.date(),
      timePeriod: z.enum(['MORNING', 'DAY', 'EVENING', 'WHOLE_DAY']).nullable().optional(),
      sleepScore: z.number().nullable().optional(),
      wentToBedLate: z.boolean().nullable(),
      sleepHours: z.number().nullable(),
      moodScore: z.number().nullable().optional(),
      energyScore: z.number().nullable().optional(),
      journalText: z.string().nullable(),
      journalProcessedAt: z.coerce.date().nullable(),
      tags: z.array(
        z.object({
          tagId: z.string(),
          source: z.enum(['MANUAL', 'EXTRACTED']),
          intensity: z.number().nullable().optional(),
        }),
      ),
      events: z.array(
        z.object({
          type: z.enum(['FOOD', 'DRINK', 'ACTIVITY', 'SYMPTOM', 'MOOD']),
          label: z.string(),
          value: z.string().nullable().optional(),
          source: z.enum(['MANUAL', 'EXTRACTED']),
          confidence: z.number().nullable().optional(),
          rawSpan: z.string().nullable().optional(),
        }),
      ),
    }),
  ),
})

// Only supports a full replace for v1 — merge semantics would need conflict
// resolution that isn't worth building before this is actually needed.
exportRouter.post('/import', async (req, res) => {
  const parsed = importBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { tags, checkIns } = parsed.data

  await prisma.$transaction(async (tx) => {
    await tx.insight.deleteMany({})
    await tx.event.deleteMany({})
    await tx.checkInTag.deleteMany({})
    await tx.checkIn.deleteMany({})
    await tx.tag.deleteMany({})

    // Parents must exist before children can reference them.
    const sortedTags = [...tags].sort((a, b) => (a.parentTagId ? 1 : 0) - (b.parentTagId ? 1 : 0))
    for (const tag of sortedTags) {
      await tx.tag.create({ data: tag })
    }

    for (const checkIn of checkIns) {
      const { tags: checkInTags, events, ...rest } = checkIn
      await tx.checkIn.create({
        data: {
          ...rest,
          tags: {
            create: checkInTags.map((t) => ({ tagId: t.tagId, source: t.source, intensity: t.intensity })),
          },
          events: { create: events },
        },
      })
    }
  })

  res.json({ ok: true, tagsImported: tags.length, checkInsImported: checkIns.length })
})
