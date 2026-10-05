-- Product category: a free-text grouping tag chosen from a dropdown of existing tags (or typed new).
-- Additive and nullable: no data change, old code ignores the column. Index backs the
-- category filter on the Products page.

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "category" TEXT;

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");
