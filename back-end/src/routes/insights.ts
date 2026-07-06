import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../db/client.js'
import { generateInsights, getPatterns } from '../services/insights.js'

export const insightsRouter = Router()

insightsRouter.get('/patterns', async (_req, res) => {
  const result = await getPatterns()
  res.json(result)
})

insightsRouter.get('/', async (req, res) => {
  const includeDismissed = req.query.includeDismissed === 'true'
  const insights = await prisma.insight.findMany({
    where: includeDismissed ? undefined : { dismissed: false },
    orderBy: { generatedAt: 'desc' },
  })
  res.json(insights)
})

const generateBodySchema = z.object({ force: z.boolean().optional() })

insightsRouter.post('/generate', async (req, res) => {
  const parsed = generateBodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  try {
    const result = await generateInsights({ force: parsed.data.force })
    res.json(result)
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to generate insights' })
  }
})

const dismissSchema = z.object({ dismissed: z.boolean() })

insightsRouter.patch('/:id', async (req, res) => {
  const parsed = dismissSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const existing = await prisma.insight.findUnique({ where: { id: req.params.id } })
  if (!existing) {
    res.status(404).json({ error: 'Insight not found' })
    return
  }

  const insight = await prisma.insight.update({
    where: { id: req.params.id },
    data: { dismissed: parsed.data.dismissed },
  })

  res.json(insight)
})
