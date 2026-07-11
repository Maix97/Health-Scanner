import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client.js'

export const exportRouter = Router()

exportRouter.get('/export', async (req, res) => {
  const userId = req.userId
  const [tags, checkIns] = await Promise.all([
    prisma.tag.findMany({ orderBy: { label: 'asc' } }),
    prisma.checkIn.findMany({
      where: { userId },
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
      sleptIn: c.sleptIn,
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
      sleptIn: z.boolean().nullable().optional(),
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

// Replaces only the current user's check-ins and insights. Tags are global so
// non-preset imported tags are upserted rather than replacing all global tags.
exportRouter.post('/import', async (req, res) => {
  const parsed = importBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { tags, checkIns } = parsed.data
  const userId = req.userId

  await prisma.$transaction(async (tx) => {
    // Clear only this user's data
    await tx.insight.deleteMany({ where: { userId } })
    await tx.checkIn.deleteMany({ where: { userId } })
    // Delete this user's non-preset custom tags
    await tx.tag.deleteMany({ where: { userId, isPreset: false } })

    // Upsert tags — presets by label (global), custom tags with userId
    const sortedTags = [...tags].sort((a, b) => (a.parentTagId ? 1 : 0) - (b.parentTagId ? 1 : 0))
    for (const tag of sortedTags) {
      if (tag.isPreset) {
        const existing = await tx.tag.findFirst({ where: { label: tag.label, isPreset: true } })
        if (!existing) {
          await tx.tag.create({ data: { id: tag.id, label: tag.label, category: tag.category, polarity: tag.polarity ?? undefined, isPreset: true } })
        }
      } else {
        await tx.tag.upsert({
          where: { id: tag.id },
          update: {},
          create: { id: tag.id, label: tag.label, category: tag.category, polarity: tag.polarity ?? undefined, isPreset: false, userId },
        })
      }
    }

    for (const checkIn of checkIns) {
      const { tags: checkInTags, events, ...rest } = checkIn
      await tx.checkIn.create({
        data: {
          ...rest,
          userId,
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
