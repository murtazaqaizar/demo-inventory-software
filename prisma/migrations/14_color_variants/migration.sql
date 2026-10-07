-- Stock per color (client B, 2026-10-07): one product can carry several colors,
-- each with its own stock. Every stock-moving line can name the color.
--
-- Existing data: a product that had one color (Product.colorId) gets that color as
-- its only variant, and its whole history is tagged with it, so per-color stock
-- equals the old product stock. Products without a color stay colorless.

-- CreateTable
CREATE TABLE "ProductColor" (
    "productId" TEXT NOT NULL,
    "colorId" TEXT NOT NULL,

    CONSTRAINT "ProductColor_pkey" PRIMARY KEY ("productId","colorId")
);
CREATE INDEX "ProductColor_colorId_idx" ON "ProductColor"("colorId");
ALTER TABLE "ProductColor" ADD CONSTRAINT "ProductColor_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductColor" ADD CONSTRAINT "ProductColor_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Color on every stock-moving line.
ALTER TABLE "StockMovement" ADD COLUMN "colorId" TEXT;
ALTER TABLE "PurchaseItem" ADD COLUMN "colorId" TEXT;
ALTER TABLE "InvoiceItem" ADD COLUMN "colorId" TEXT;
ALTER TABLE "CreditNoteItem" ADD COLUMN "colorId" TEXT;

-- Backfill from the old single color.
INSERT INTO "ProductColor" ("productId", "colorId")
SELECT "id", "colorId" FROM "Product" WHERE "colorId" IS NOT NULL;

UPDATE "StockMovement" m SET "colorId" = p."colorId" FROM "Product" p WHERE p."id" = m."productId" AND p."colorId" IS NOT NULL;
UPDATE "PurchaseItem" x SET "colorId" = p."colorId" FROM "Product" p WHERE p."id" = x."productId" AND p."colorId" IS NOT NULL;
UPDATE "InvoiceItem" x SET "colorId" = p."colorId" FROM "Product" p WHERE p."id" = x."productId" AND p."colorId" IS NOT NULL;
UPDATE "CreditNoteItem" x SET "colorId" = p."colorId" FROM "Product" p WHERE p."id" = x."productId" AND p."colorId" IS NOT NULL;

-- Product.colorId is replaced by the variants table.
ALTER TABLE "Product" DROP CONSTRAINT "Product_colorId_fkey";
DROP INDEX "Product_colorId_idx";
ALTER TABLE "Product" DROP COLUMN "colorId";

-- Indexes + foreign keys for the new columns.
CREATE INDEX "StockMovement_productId_colorId_idx" ON "StockMovement"("productId", "colorId");
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseItem" ADD CONSTRAINT "PurchaseItem_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CreditNoteItem" ADD CONSTRAINT "CreditNoteItem_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE SET NULL ON UPDATE CASCADE;
