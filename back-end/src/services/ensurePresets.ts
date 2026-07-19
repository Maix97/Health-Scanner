import { prisma } from '../db/client.js'

// Tags added after the initial seed — upserted on every startup so Railway
// picks them up automatically without a manual seed run.
const ADDED_PRESETS: { label: string; category: 'QUICK_TOGGLE' | 'FOOD' | 'EXERCISE' | 'FEELING'; hasIntensity?: boolean }[] = [
  { label: 'hydration bad', category: 'QUICK_TOGGLE', hasIntensity: false },
  { label: 'hydration good', category: 'QUICK_TOGGLE', hasIntensity: false },
  { label: 'screen time low', category: 'QUICK_TOGGLE', hasIntensity: false },
  { label: 'screen time medium', category: 'QUICK_TOGGLE', hasIntensity: false },
  { label: 'screen time high', category: 'QUICK_TOGGLE', hasIntensity: false },
]

// Tags that already exist but need hasIntensity corrected.
const INTENSITY_OVERRIDES: { label: string; hasIntensity: boolean }[] = [
  { label: 'no food', hasIntensity: false },
  { label: 'hydration bad', hasIntensity: false },
  { label: 'hydration good', hasIntensity: false },
]

// One-time relabels — idempotent since after the first run the "from" label
// no longer exists. Hydration collapsed from Low/OK/Good to a plain Bad/Good
// toggle, so the old "low" preset becomes "bad" in place (keeping its id and
// every check-in that already references it). "hydration ok" is deliberately
// left alone as a legacy tag rather than reclassified into either side.
const LABEL_RENAMES: { from: string; to: string }[] = [
  { from: 'hydration low', to: 'hydration bad' },
]

export async function ensurePresets(): Promise<void> {
  for (const rename of LABEL_RENAMES) {
    await prisma.tag.updateMany({
      where: { label: rename.from, isPreset: true },
      data: { label: rename.to },
    })
  }
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
