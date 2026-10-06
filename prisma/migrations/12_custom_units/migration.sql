-- Units become the shop's own list (client B, 2026-10-06): the three fixed units
-- turn into Unit rows, and the owner can add more (kg, dozen, litre…).
-- Stored quantities do not change — they were already thousandths of the unit.

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short" TEXT NOT NULL,
    "decimals" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Unit_name_key" ON "Unit"("name");
CREATE UNIQUE INDEX "Unit_short_key" ON "Unit"("short");

-- The three units that existed as an enum, with fixed ids so this is repeatable.
INSERT INTO "Unit" ("id", "name", "short", "decimals", "updatedAt") VALUES
  ('unit_piece', 'Piece', 'pcs', false, CURRENT_TIMESTAMP),
  ('unit_meter', 'Meter', 'm',   true,  CURRENT_TIMESTAMP),
  ('unit_feet',  'Feet',  'ft',  true,  CURRENT_TIMESTAMP);

-- Category: enum -> foreign key.
ALTER TABLE "Category" ADD COLUMN "unitId" TEXT;
UPDATE "Category" SET "unitId" = CASE "unit"
  WHEN 'METER' THEN 'unit_meter'
  WHEN 'FEET'  THEN 'unit_feet'
  ELSE 'unit_piece' END;
ALTER TABLE "Category" ALTER COLUMN "unitId" SET NOT NULL,
DROP COLUMN "unit";
CREATE INDEX "Category_unitId_idx" ON "Category"("unitId");
ALTER TABLE "Category" ADD CONSTRAINT "Category_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bill and return lines keep a text snapshot of the unit's short label, so an old
-- bill still prints "12.5 m" even if the unit is later renamed.
ALTER TABLE "InvoiceItem" ALTER COLUMN "unit" DROP DEFAULT;
ALTER TABLE "InvoiceItem" ALTER COLUMN "unit" TYPE TEXT USING (CASE "unit"::text
  WHEN 'METER' THEN 'm' WHEN 'FEET' THEN 'ft' ELSE 'pcs' END);
ALTER TABLE "InvoiceItem" ALTER COLUMN "unit" SET DEFAULT 'pcs';

ALTER TABLE "CreditNoteItem" ALTER COLUMN "unit" DROP DEFAULT;
ALTER TABLE "CreditNoteItem" ALTER COLUMN "unit" TYPE TEXT USING (CASE "unit"::text
  WHEN 'METER' THEN 'm' WHEN 'FEET' THEN 'ft' ELSE 'pcs' END);
ALTER TABLE "CreditNoteItem" ALTER COLUMN "unit" SET DEFAULT 'pcs';

-- DropEnum
DROP TYPE "QtyUnit";
