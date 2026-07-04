-- Data already backfilled into sleepScore before this migration was applied.
ALTER TABLE "CheckIn" DROP COLUMN "sleepQuality";
