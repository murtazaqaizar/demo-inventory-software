-- Give every purchase a readable number ("Purchase #14").
--
-- The cuid is unreadable and supplier + date can't tell two purchases apart,
-- so purchases get the same kind of sequential number bills already have.
--
-- Existing rows are numbered oldest-first, so the numbering matches the order
-- the purchases actually happened in. Additive: no column or table is dropped.

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "number" INTEGER;

-- Backfill oldest-first. Deliberately NOT relying on a volatile column default
-- to number existing rows, since that leaves the order up to the table rewrite.
WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "date" ASC, "createdAt" ASC, "id" ASC) AS rn
  FROM "Purchase"
)
UPDATE "Purchase" p
SET "number" = o.rn
FROM ordered o
WHERE p."id" = o."id";

-- Sequence for new rows, continuing after the highest backfilled number.
CREATE SEQUENCE "Purchase_number_seq" OWNED BY "Purchase"."number";
SELECT setval(
  '"Purchase_number_seq"',
  COALESCE((SELECT MAX("number") FROM "Purchase"), 0) + 1,
  false
);
ALTER TABLE "Purchase" ALTER COLUMN "number" SET DEFAULT nextval('"Purchase_number_seq"');
ALTER TABLE "Purchase" ALTER COLUMN "number" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_number_key" ON "Purchase"("number");
