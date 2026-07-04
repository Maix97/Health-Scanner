import { z } from 'zod'

export const EXTRACTION_TOOL_NAME = 'extract_health_events'

export const extractionToolSchema = {
  name: EXTRACTION_TOOL_NAME,
  description:
    'Extract discrete health-relevant events mentioned in a personal journal entry: foods eaten, drinks consumed, physical activities, symptoms, and mood mentions.',
  input_schema: {
    type: 'object' as const,
    properties: {
      events: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['FOOD', 'DRINK', 'ACTIVITY', 'SYMPTOM', 'MOOD'],
              description:
                'FOOD: what was eaten, OR a meaningful dietary pattern (fasting, skipped a meal, overate, ate light). DRINK: anything consumed that is not solid food (coffee, alcohol, water, tea). ACTIVITY: physical activity or exercise. SYMPTOM: a physical symptom or sensation in the user\'s own body (headache, nausea, fatigue, felt overheated). MOOD: an emotional state mentioned (happy, anxious, stressed).',
            },
            label: {
              type: 'string',
              description:
                'A short, normalized, lowercase noun or verb phrase for the event, e.g. "coffee", "running", "headache", "fasting". Prefer the higher-level pattern over a literal restatement when the text describes one — e.g. "only ate a little because I was fasting" -> "fasting", not "ate a little". Do not copy the full sentence.',
            },
            value: {
              type: 'string',
              description: 'Optional short qualifier — quantity, intensity, or time of day, if mentioned.',
            },
            confidence: {
              type: 'number',
              description: 'How confident you are this was actually stated or strongly implied, from 0 to 1.',
            },
            rawSpan: {
              type: 'string',
              description: 'The literal substring of the journal text that this event was extracted from.',
            },
          },
          required: ['type', 'label', 'confidence'],
        },
      },
    },
    required: ['events'],
  },
}

export const extractedEventSchema = z.object({
  type: z.enum(['FOOD', 'DRINK', 'ACTIVITY', 'SYMPTOM', 'MOOD']),
  label: z.string().trim().min(1).max(100),
  value: z.string().trim().max(200).optional(),
  confidence: z.number().min(0).max(1),
  rawSpan: z.string().max(500).optional(),
})

export const extractionResultSchema = z.object({
  events: z.array(extractedEventSchema),
})

export type ExtractedEvent = z.infer<typeof extractedEventSchema>

// Maps a normalized label to the set of labels it should be treated as identical to
// for the purpose of not duplicating something the user already tagged manually.
export const LABEL_SYNONYMS: Record<string, string[]> = {
  coffee: ['coffee', 'espresso', 'latte', 'cappuccino'],
  alcohol: ['alcohol', 'beer', 'wine', 'liquor', 'cocktail'],
  exercised: ['exercised', 'exercise', 'running', 'workout', 'gym'],
  'ate out': ['ate out', 'restaurant', 'takeout'],
  'hydrated well': ['hydrated well', 'water', 'hydration'],
  'took medication': ['took medication', 'medication', 'medicine'],
  'late screen time': ['late screen time', 'screen time'],
}

export function normalizeLabel(label: string): string {
  return label.trim().toLowerCase()
}

function synonymGroupFor(label: string): string[] {
  const normalized = normalizeLabel(label)
  for (const group of Object.values(LABEL_SYNONYMS)) {
    if (group.includes(normalized)) return group
  }
  return [normalized]
}

export function labelsMatch(a: string, b: string): boolean {
  const normalizedB = normalizeLabel(b)
  return synonymGroupFor(a).includes(normalizedB)
}
