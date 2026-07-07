/**
 * One-time migration: assign all existing rows (check-ins, custom tags, insights)
 * to the owner's Supabase user account.
 *
 * Usage:
 *   1. Create your Supabase account and copy your user UUID from the dashboard
 *      (Authentication → Users → your row → User UID).
 *   2. Add OWNER_USER_ID=<your-uuid> to back-end/.env
 *   3. Run: cd back-end && npx tsx src/scripts/migrate-owner-data.ts
 *
 * The script is idempotent — it only updates rows where userId IS NULL, so it
 * is safe to re-run.
 */

import { prisma } from '../db/client.js'

const OWNER_USER_ID = process.env.OWNER_USER_ID

if (!OWNER_USER_ID) {
  console.error('Error: OWNER_USER_ID is not set. Add it to .env and re-run.')
  process.exit(1)
}

async function main() {
  console.log(`Migrating existing data to owner: ${OWNER_USER_ID}`)

  const [checkIns, customTags, insights] = await Promise.all([
    prisma.checkIn.updateMany({
      where: { userId: null },
      data: { userId: OWNER_USER_ID },
    }),
    // Only migrate non-preset custom tags; presets stay global (userId = null)
    prisma.tag.updateMany({
      where: { userId: null, isPreset: false },
      data: { userId: OWNER_USER_ID },
    }),
    prisma.insight.updateMany({
      where: { userId: null },
      data: { userId: OWNER_USER_ID },
    }),
  ])

  console.log(`Done:`)
  console.log(`  ${checkIns.count} check-ins assigned`)
  console.log(`  ${customTags.count} custom tags assigned`)
  console.log(`  ${insights.count} insights assigned`)
}

main()
  .catch((err) => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
