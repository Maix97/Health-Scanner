import { prisma } from '../db/client.js'

// Tags added after the initial seed — upserted on every startup so Railway
// picks them up automatically without a manual seed run.
const ADDED_PRESETS: { label: string; category: 'QUICK_TOGGLE' | 'FOOD' | 'EXERCISE' | 'FEELING' }[] = [
  { label: 'hydration low', category: 'QUICK_TOGGLE' },
  { label: 'hydration ok', category: 'QUICK_TOGGLE' },
  { label: 'hydration good', category: 'QUICK_TOGGLE' },
]

export async function ensurePresets(): Promise<void> {
  for (const preset of ADDED_PRESETS) {
    const existing = await prisma.tag.findFirst({ where: { label: preset.label, isPreset: true } })
    if (!existing) {
      await prisma.tag.create({ data: { label: preset.label, category: preset.category, isPreset: true } })
    }
  }
}
