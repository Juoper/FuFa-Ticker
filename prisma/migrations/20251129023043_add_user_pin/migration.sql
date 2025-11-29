/*
  Warnings:

  - Added the required column `pin` to the `User` table without a default value. This is not possible if the table is not empty.

*/

-- Step 1: Add pin column as nullable first
ALTER TABLE "User" ADD COLUMN "pin" TEXT;

-- Step 2: Generate unique 2-digit PINs for existing users (10-99)
-- We'll use a sequential approach starting from 10
UPDATE "User" SET "pin" = 
  CASE 
    WHEN (SELECT COUNT(*) FROM "User" WHERE "pin" IS NOT NULL) + 10 < 100 
    THEN printf('%02d', (SELECT COUNT(*) FROM "User" WHERE "pin" IS NOT NULL) + 10)
    ELSE printf('%02d', ABS(RANDOM()) % 90 + 10)
  END
WHERE "pin" IS NULL;

-- Step 3: Make sure all users have a PIN
UPDATE "User" SET "pin" = printf('%02d', (ROWID % 90) + 10) WHERE "pin" IS NULL;

-- Step 4: Now that all rows have a value, we can make it required via table recreation
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "new_User" ("createdAt", "id", "isAdmin", "name", "pin") 
SELECT "createdAt", "id", "isAdmin", "name", "pin" FROM "User";

DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";

-- Step 5: Add unique constraint on pin
CREATE UNIQUE INDEX "User_pin_key" ON "User"("pin");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
