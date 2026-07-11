import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client.js'
import { processJournalExtraction } from '../services/extraction.js'

export const checkInsRouter = Router()

const checkInInclude = {
  tags: { include: { tag: true } },
  events: true,
} as const

const eventInputSchema = z.object({
  type: z.enum(['FOOD', 'DRINK', 'ACTIVITY', 'SYMPTOM', 'MOOD']),
  label: z.string().trim().min(1).max(100),
  value: z.string().trim().max(200).optional(),
})

const checkInBodySchema = z.object({
  occurredAt: z.string().datetime().optional(),
  timePeriod: z.enum(['MORNING', 'DAY', 'EVENING', 'WHOLE_DAY']).nullable().optional(),
  sleepScore: z.number().int().min(1).max(10).nullable().optional(),
  wentToBedLate: z.boolean().nullable().optional(),
  sleptIn: z.boolean().nullable().optional(),
  sleepHours: z.number().min(0).max(24).nullable().optional(),
  isWorkDay: z.boolean().nullable().optional(),
  moodScore: z.number().int().min(1).max(10).nullable().optional(),
  energyScore: z.number().int().min(1).max(10).nullable().optional(),
  journalText: z.string().max(5000).nullable().optional(),
  tagIds: z.array(z.string()).optional(),
  tagIntensities: z.record(z.string(), z.number().int().min(1).max(3)).optional(),
  events: z.array(eventInputSchema).optional(),
})

checkInsRouter.post('/', async (req, res) => {
  const parsed = checkInBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { tagIds = [], tagIntensities = {}, events = [], occurredAt, ...rest } = parsed.data

  const checkIn = await prisma.checkIn.create({
    data: {
      ...rest,
      userId: req.userId,
      occurredAt: occurredAt ? new Date(occurredAt) : undefined,
      tags: {
        create: tagIds.map((tagId) => ({ tagId, source: 'MANUAL' as const, intensity: tagIntensities[tagId] })),
      },
      events: {
        create: events.map((event) => ({ ...event, source: 'MANUAL' as const })),
      },
    },
    include: checkInInclude,
  })

  if (checkIn.journalText?.trim()) {
    await processJournalExtraction(checkIn.id)
    const withExtraction = await prisma.checkIn.findUnique({
      where: { id: checkIn.id },
      include: checkInInclude,
    })
    res.status(201).json(withExtraction)
    return
  }

  res.status(201).json(checkIn)
})

const listQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

checkInsRouter.get('/', async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { from, to, limit, offset } = parsed.data

  const checkIns = await prisma.checkIn.findMany({
    where: {
      userId: req.userId,
      occurredAt: {
        gte: from ? new Date(from) : undefined,
        lte: to ? new Date(to) : undefined,
      },
    },
    include: checkInInclude,
    orderBy: { occurredAt: 'desc' },
    take: limit,
    skip: offset,
  })

  res.json(checkIns)
})

checkInsRouter.get('/:id', async (req, res) => {
  const checkIn = await prisma.checkIn.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: checkInInclude,
  })

  if (!checkIn) {
    res.status(404).json({ error: 'Check-in not found' })
    return
  }

  res.json(checkIn)
})

checkInsRouter.patch('/:id', async (req, res) => {
  const parsed = checkInBodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const existing = await prisma.checkIn.findFirst({ where: { id: req.params.id, userId: req.userId } })
  if (!existing) {
    res.status(404).json({ error: 'Check-in not found' })
    return
  }

  const { tagIds, tagIntensities = {}, events, occurredAt, ...rest } = parsed.data
  const journalTextChanged = 'journalText' in parsed.data

  if (tagIds) {
    await prisma.checkInTag.deleteMany({
      where: { checkInId: req.params.id, source: 'MANUAL' },
    })
  }
  if (events) {
    await prisma.event.deleteMany({
      where: { checkInId: req.params.id, source: 'MANUAL' },
    })
  }
  if (journalTextChanged) {
    await prisma.event.deleteMany({
      where: { checkInId: req.params.id, source: 'EXTRACTED' },
    })
  }

  let checkIn = await prisma.checkIn.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      journalProcessedAt: journalTextChanged ? null : undefined,
      occurredAt: occurredAt ? new Date(occurredAt) : undefined,
      tags: tagIds
        ? {
            create: tagIds.map((tagId) => ({
              tagId,
              source: 'MANUAL' as const,
              intensity: tagIntensities[tagId],
            })),
          }
        : undefined,
      events: events
        ? { create: events.map((event) => ({ ...event, source: 'MANUAL' as const })) }
        : undefined,
    },
    include: checkInInclude,
  })

  if (journalTextChanged && checkIn.journalText?.trim()) {
    await processJournalExtraction(checkIn.id)
    checkIn = (await prisma.checkIn.findUnique({
      where: { id: checkIn.id },
      include: checkInInclude,
    }))!
  }

  res.json(checkIn)
})

checkInsRouter.post('/:id/reprocess', async (req, res) => {
  const existing = await prisma.checkIn.findFirst({ where: { id: req.params.id, userId: req.userId } })
  if (!existing) {
    res.status(404).json({ error: 'Check-in not found' })
    return
  }

  await prisma.event.deleteMany({
    where: { checkInId: req.params.id, source: 'EXTRACTED' },
  })

  await processJournalExtraction(req.params.id)

  const checkIn = await prisma.checkIn.findUnique({
    where: { id: req.params.id },
    include: checkInInclude,
  })

  res.json(checkIn)
})

checkInsRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.checkIn.findFirst({ where: { id: req.params.id, userId: req.userId } })
  if (!existing) {
    res.status(404).json({ error: 'Check-in not found' })
    return
  }

  await prisma.checkIn.delete({ where: { id: req.params.id } })
  res.status(204).send()
})
