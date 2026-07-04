-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "polarity" TEXT,
    "isPreset" BOOLEAN NOT NULL DEFAULT false,
    "parentTagId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tag_parentTagId_fkey" FOREIGN KEY ("parentTagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Tag" ("category", "createdAt", "id", "isPreset", "label", "polarity") SELECT "category", "createdAt", "id", "isPreset", "label", "polarity" FROM "Tag";
DROP TABLE "Tag";
ALTER TABLE "new_Tag" RENAME TO "Tag";
CREATE UNIQUE INDEX "Tag_label_key" ON "Tag"("label");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
