-- Product tags: a managed list of categories the shop can create before any product uses them.
-- Additive: Product.category is unchanged, old code ignores the new table.

-- CreateTable
CREATE TABLE "ProductTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductTag_name_key" ON "ProductTag"("name");

-- Backfill: every category already on a product becomes a tag, so the dropdown
-- keeps offering what it offered before. Ids are generated here (not cuid, but
-- any unique text works for the primary key).
INSERT INTO "ProductTag" ("id", "name")
SELECT 'tag_' || md5("category"), "category"
FROM (SELECT DISTINCT "category" FROM "Product" WHERE "category" IS NOT NULL AND "category" <> '') c
ON CONFLICT ("name") DO NOTHING;
