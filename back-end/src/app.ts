import cors from 'cors'
import express from 'express'
import { requireAuth } from './middleware/auth.js'
import { checkInsRouter } from './routes/checkins.js'
import { tagsRouter } from './routes/tags.js'
import { insightsRouter } from './routes/insights.js'
import { exportRouter } from './routes/export.js'
import { dashboardRouter } from './routes/dashboard.js'
import { CLAUDE_MODEL } from './services/claude.js'

export const app = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/config', (_req, res) => {
  res.json({ model: CLAUDE_MODEL, claudeConfigured: Boolean(process.env.ANTHROPIC_API_KEY) })
})

// All /api/* routes (except /api/config above) require a valid Supabase JWT.
app.use('/api', requireAuth)

app.use('/api/checkins', checkInsRouter)
app.use('/api/tags', tagsRouter)
app.use('/api/insights', insightsRouter)
app.use('/api', exportRouter)
app.use('/api/dashboard', dashboardRouter)
