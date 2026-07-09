import { prisma } from '../db/client.js'

// Tags added after the initial seed — upserted on every startup so Railway
// picks them up automatically without a manual seed run.
const ADDED_PRESETS: { label: string; category: 'QUICK_TOGGLE' | 'FOOD' | 'EXERCISE' | 'FEELING'; hasIntensity?: boolean }[] = [
  { label: 'hydration low', category: 'QUICK_TOGGLE', hasIntensity: false },
  { label: 'hydration ok', category: 'QUICK_TOGGLE', hasIntensity: false },
  { label: 'hydration good', category: 'QUICK_TOGGLE', hasIntensity: false },
  { label: 'screen time low', category: 'QUICK_TOGGLE', hasIntensity: false },
  { label: 'screen time medium', category: 'QUICK_TOGGLE', hasIntensity: false },
  { label: 'screen time high', category: 'QUICK_TOGGLE', hasIntensity: false },
]

// Tags that already exist but need hasIntensity corrected.
const INTENSITY_OVERRIDES: { label: string; hasIntensity: boolean }[] = [
  { label: 'no food', hasIntensity: false },
  { label: 'hydration low', hasIntensity: false },
  { label: 'hydration ok', hasIntensity: false },
  { label: 'hydration good', hasIntensity: false },
]

export async function ensurePresets(): Promise<void> {
  for (const preset of ADDED_PRESETS) {
    const existing = await prisma.tag.findFirst({ where: { label: preset.label, isPreset: true } })
    if (!existing) {
      await prisma.tag.create({
        data: { label: preset.label, category: preset.category, isPreset: true, hasIntensity: preset.hasIntensity ?? true },
      })
    }
  }
  for (const override of INTENSITY_OVERRIDES) {
    await prisma.tag.updateMany({
      where: { label: override.label, isPreset: true },
      data: { hasIntensity: override.hasIntensity },
    })
  }
}
