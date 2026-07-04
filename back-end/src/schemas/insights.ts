import { z } from 'zod'

export const INSIGHT_TOOL_NAME = 'report_health_insights'

export const insightToolSchema = {
  name: INSIGHT_TOOL_NAME,
  description:
    'Report health insights as three categorized lists based on the verified statistical findings and journal excerpts provided.',
  input_schema: {
    type: 'object' as const,
    properties: {
      boosts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Short, plain-language statements about what seems to be boosting mood/health.',
      },
      drags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Short, plain-language statements about what seems to be hurting mood/health.',
      },
      notes: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Softer, qualitative observations drawn from journal text that are not statistically verified — phrase these as tentative.',
      },
    },
    required: ['boosts', 'drags', 'notes'],
  },
}

export const insightResultSchema = z.object({
  boosts: z.array(z.string()),
  drags: z.array(z.string()),
  notes: z.array(z.string()),
})

export type InsightSummary = z.infer<typeof insightResultSchema>
