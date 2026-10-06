-- Client B feedback round 1 (2026-10-06): categories carry a unit (piece / meter / feet),
-- quantities allow decimals, products get an optional color, box/carton conversions are
-- removed, and bills can carry free-text "custom" lines that are not in stock.
--
-- Quantities move to integer THOUSANDTHS of a unit (2.5 m = 2500), like paisa for money.
-- Every existing quantity is converted in place (x1000) — written by hand rather than
-- generated, because the generated diff drops and re-adds the columns and loses the data.
--
-- All historic bill lines were sold by the PIECE (checked on both the scratch and live demo
-- databases before writing this), but a BOX/CARTON line is still converted correctly: the
-- quantity becomes its resolved pieces and the rate is re-expressed per piece.

-- CreateEnum
CREATE TYPE "QtyUnit" AS ENUM ('PIECE', 'METER', 'FEET');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" "QtyUnit" NOT NULL DEFAULT 'PIECE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- Product: tag strings become Category rows (unit PIECE — everything was counted in pieces).
ALTER TABLE "Product" ADD COLUMN "categoryId" TEXT,
ADD COLUMN "color" TEXT;

INSERT INTO "Category" ("id", "name", "unit", "updatedAt")
SELECT gen_random_uuid()::text, t.name, 'PIECE', CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "category" AS name FROM "Product" WHERE "category" IS NOT NULL) t;

UPDATE "Product" p SET "categoryId" = c."id" FROM "Category" c WHERE c."name" = p."category";

DROP INDEX "Product_category_idx";
ALTER TABLE "Product" DROP COLUMN "category",
DROP COLUMN "piecesPerBox",
DROP COLUMN "piecesPerCarton";
ALTER TABLE "Product" RENAME COLUMN "minStockLevel" TO "minStockMilli";
UPDATE "Product" SET "minStockMilli" = "minStockMilli" * 1000;

CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- StockMovement / PurchaseItem: pieces -> thousandths.
ALTER TABLE "StockMovement" RENAME COLUMN "piecesDelta" TO "qtyMilli";
UPDATE "StockMovement" SET "qtyMilli" = "qtyMilli" * 1000;

ALTER TABLE "PurchaseItem" RENAME COLUMN "pieces" TO "qtyMilli";
UPDATE "PurchaseItem" SET "qtyMilli" = "qtyMilli" * 1000;

-- InvoiceItem: optional product (custom lines), description, QtyUnit snapshot.
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_productId_fkey";
ALTER TABLE "InvoiceItem" ALTER COLUMN "productId" DROP NOT NULL,
ADD COLUMN "description" TEXT,
ADD COLUMN "qtyMilli" INTEGER;
UPDATE "InvoiceItem" SET
  "qtyMilli" = "pieces" * 1000,
  "ratePaisa" = CASE WHEN "unit" = 'PIECE' OR "pieces" = 0 THEN "ratePaisa"
                     ELSE ROUND("ratePaisa"::numeric * "quantity" / "pieces")::int END;
ALTER TABLE "InvoiceItem" ALTER COLUMN "qtyMilli" SET NOT NULL,
DROP COLUMN "quantity",
DROP COLUMN "pieces",
DROP COLUMN "unit",
ADD COLUMN "unit" "QtyUnit" NOT NULL DEFAULT 'PIECE';
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreditNoteItem: same shape as InvoiceItem.
ALTER TABLE "CreditNoteItem" DROP CONSTRAINT "CreditNoteItem_productId_fkey";
ALTER TABLE "CreditNoteItem" ALTER COLUMN "productId" DROP NOT NULL,
ADD COLUMN "description" TEXT,
ADD COLUMN "qtyMilli" INTEGER;
UPDATE "CreditNoteItem" SET
  "qtyMilli" = "pieces" * 1000,
  "ratePaisa" = CASE WHEN "unit" = 'PIECE' OR "pieces" = 0 THEN "ratePaisa"
                     ELSE ROUND("ratePaisa"::numeric * "quantity" / "pieces")::int END;
ALTER TABLE "CreditNoteItem" ALTER COLUMN "qtyMilli" SET NOT NULL,
DROP COLUMN "quantity",
DROP COLUMN "pieces",
DROP COLUMN "unit",
ADD COLUMN "unit" "QtyUnit" NOT NULL DEFAULT 'PIECE';
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CustomerProductPrice: rate is now always per one unit; the box/carton memory goes.
ALTER TABLE "CustomerProductPrice" DROP COLUMN "lastUnit";

-- DropEnum
DROP TYPE "SaleUnit";
