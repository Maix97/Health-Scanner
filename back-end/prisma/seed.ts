import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const FEELING_TAGS: { label: string; polarity: 'POSITIVE' | 'NEGATIVE' }[] = [
  { label: 'tired', polarity: 'NEGATIVE' },
  { label: 'headache', polarity: 'NEGATIVE' },
  { label: 'heartburn', polarity: 'NEGATIVE' },
  { label: 'lightheaded', polarity: 'NEGATIVE' },
  { label: 'nauseous', polarity: 'NEGATIVE' },
  { label: 'anxious', polarity: 'NEGATIVE' },
  { label: 'stressed', polarity: 'NEGATIVE' },
  { label: 'sad', polarity: 'NEGATIVE' },
  { label: 'irritable', polarity: 'NEGATIVE' },
  { label: 'energetic', polarity: 'POSITIVE' },
  { label: 'feeling good', polarity: 'POSITIVE' },
  { label: 'happy', polarity: 'POSITIVE' },
  { label: 'calm', polarity: 'POSITIVE' },
]

const QUICK_TOGGLE_TAGS = [
  'coffee',
  'alcohol',
  'exercised',
  'ate out',
  'late screen time',
  'took medication',
  'hydrated well',
  'hydration low',
  'hydration ok',
  'hydration good',
]

const EXERCISE_TAGS = ['running', 'walking', 'hiking', 'swimming', 'bicycling', 'weights', 'calisthenics']

const FOOD_TAGS = [
  'sugar',
  'carbs',
  'protein',
  'junk',
  'microwave food',
  'store sandwich',
  'healthy',
  'light',
  'meal',
  'sweets',
  'snacks',
]

// Sub-options shown when their parent FOOD tag is selected.
const FOOD_CHILD_TAGS: Record<string, string[]> = {
  junk: ['pizza', 'burger', 'fries', 'candy', 'fast food'],
  light: ['sandwich', 'salad', 'soup', 'fruit'],
  meal: ['pasta', 'rice', 'chicken', 'meat'],
  sweets: ['chocolate', 'ice cream', 'cookies'],
  snacks: ['peanuts', 'chips', 'pretzels', 'popcorn'],
}

async function main() {
  for (const { label, polarity } of FEELING_TAGS) {
    await prisma.tag.upsert({
      where: { label },
      update: { polarity },
      create: { label, category: 'FEELING', polarity, isPreset: true },
    })
  }

  for (const label of QUICK_TOGGLE_TAGS) {
    await prisma.tag.upsert({
      where: { label },
      update: {},
      create: { label, category: 'QUICK_TOGGLE', isPreset: true },
    })
  }

  for (const label of EXERCISE_TAGS) {
    await prisma.tag.upsert({
      where: { label },
      update: {},
      create: { label, category: 'EXERCISE', isPreset: true },
    })
  }

  for (const label of FOOD_TAGS) {
    await prisma.tag.upsert({
      where: { label },
      update: {},
      create: { label, category: 'FOOD', isPreset: true },
    })
  }

  let childCount = 0
  for (const [parentLabel, childLabels] of Object.entries(FOOD_CHILD_TAGS)) {
    const parent = await prisma.tag.findUniqueOrThrow({ where: { label: parentLabel } })
    for (const label of childLabels) {
      await prisma.tag.upsert({
        where: { label },
        update: { parentTagId: parent.id },
        create: { label, category: 'FOOD', isPreset: true, parentTagId: parent.id },
      })
      childCount++
    }
  }

  console.log(
    `Seeded ${FEELING_TAGS.length} feeling tags, ${QUICK_TOGGLE_TAGS.length} quick-toggle tags, ${EXERCISE_TAGS.length} exercise tags, ${FOOD_TAGS.length} food tags, and ${childCount} food sub-tags.`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
