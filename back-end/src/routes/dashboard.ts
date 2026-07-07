import { Router } from 'express'
import { z } from 'zod'
import { getDashboardData } from '../services/dashboard.js'

export const dashboardRouter = Router()

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(31).default(30),
})

dashboardRouter.get('/', async (req, res) => {
  const parsed = querySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const data = await getDashboardData(parsed.data.days, req.userId)
  res.json(data)
})
