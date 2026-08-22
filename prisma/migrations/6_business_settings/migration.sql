-- CreateEnum
CREATE TYPE "LetterheadMode" AS ENUM ('NONE', 'IMAGE', 'PREPRINTED');

-- CreateTable
CREATE TABLE "BusinessSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "name" TEXT NOT NULL DEFAULT 'Shabbir Tools',
    "tagline" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "mode" "LetterheadMode" NOT NULL DEFAULT 'NONE',
    "letterheadImage" BYTEA,
    "letterheadMime" TEXT,
    "letterheadName" TEXT,
    "letterheadUpdatedAt" TIMESTAMP(3),
    "marginTopMm" INTEGER NOT NULL DEFAULT 16,
    "marginBottomMm" INTEGER NOT NULL DEFAULT 16,
    "marginSideMm" INTEGER NOT NULL DEFAULT 16,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessSettings_pkey" PRIMARY KEY ("id")
);

