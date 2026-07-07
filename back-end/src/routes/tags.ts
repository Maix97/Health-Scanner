import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client.js'

export const tagsRouter = Router()

const categorySchema = z.enum(['FEELING', 'QUICK_TOGGLE', 'EXERCISE', 'FOOD'])
const polaritySchema = z.enum(['POSITIVE', 'NEGATIVE'])

// Tags are global — presets (isPreset=true) are visible to everyone, custom tags
// (isPreset=false) show to their creator and to all other users too so the tag
// vocabulary is shared. userId on Tag tracks creator for deletion permission only.
tagsRouter.get('/', async (req, res) => {
  const category = req.query.category
  const parsed = category ? categorySchema.safeParse(category) : undefined

  if (category && !parsed?.success) {
    res.status(400).json({ error: 'Invalid category' })
    return
  }

  const tags = await prisma.tag.findMany({
    where: parsed?.success ? { category: parsed.data } : undefined,
    orderBy: { label: 'asc' },
  })
  res.json(tags)
})

const createTagSchema = z.object({
  label: z.string().trim().min(1).max(50),
  category: categorySchema,
  polarity: polaritySchema.optional(),
  parentTagId: z.string().optional(),
})

tagsRouter.post('/', async (req, res) => {
  const parsed = createTagSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const label = parsed.data.label.toLowerCase()
  const parentTagId = parsed.data.parentTagId ?? null

  // Deduplicate per parent: same label under same parent returns the existing tag
  const existing = await prisma.tag.findFirst({ where: { label, parentTagId } })
  if (existing) {
    res.status(201).json(existing)
    return
  }

  const tag = await prisma.tag.create({
    data: {
      label,
      category: parsed.data.category,
      polarity: parsed.data.polarity,
      parentTagId,
      isPreset: false,
      userId: req.userId,
    },
  })

  res.status(201).json(tag)
})

tagsRouter.delete('/:id', async (req, res) => {
  const existing = await prisma.tag.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404).json({ error: 'Tag not found' })
    return
  }

  if (existing.isPreset) {
    res.status(403).json({ error: 'Cannot delete preset tags' })
    return
  }

  if (existing.userId && existing.userId !== req.userId) {
    res.status(403).json({ error: 'Cannot delete another user\'s tag' })
    return
  }

  const removedFromCheckIns = await prisma.checkInTag.count({ where: { tagId: req.params.id } })
  await prisma.tag.delete({ where: { id: req.params.id } })

  res.json({ ok: true, removedFromCheckIns })
})
