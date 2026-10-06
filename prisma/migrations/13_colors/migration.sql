-- Colors become a managed list with swatches (client B, 2026-10-06): the product
-- form picks from a dropdown instead of a typed label.

-- CreateTable
CREATE TABLE "Color" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hex" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Color_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Color_name_key" ON "Color"("name");

-- A starter palette; the shop adds more on /categories.
INSERT INTO "Color" ("id", "name", "hex", "updatedAt") VALUES
  ('color_red',     'Red',      '#dc2626', CURRENT_TIMESTAMP),
  ('color_blue',    'Blue',     '#2563eb', CURRENT_TIMESTAMP),
  ('color_skyblue', 'Sky Blue', '#38bdf8', CURRENT_TIMESTAMP),
  ('color_green',   'Green',    '#16a34a', CURRENT_TIMESTAMP),
  ('color_yellow',  'Yellow',   '#eab308', CURRENT_TIMESTAMP),
  ('color_orange',  'Orange',   '#ea580c', CURRENT_TIMESTAMP),
  ('color_brown',   'Brown',    '#92400e', CURRENT_TIMESTAMP),
  ('color_pink',    'Pink',     '#ec4899', CURRENT_TIMESTAMP),
  ('color_purple',  'Purple',   '#7c3aed', CURRENT_TIMESTAMP),
  ('color_black',   'Black',    '#111827', CURRENT_TIMESTAMP),
  ('color_white',   'White',    '#ffffff', CURRENT_TIMESTAMP),
  ('color_grey',    'Grey',     '#6b7280', CURRENT_TIMESTAMP),
  ('color_silver',  'Silver',   '#c0c0c0', CURRENT_TIMESTAMP),
  ('color_golden',  'Golden',   '#d4a017', CURRENT_TIMESTAMP);

-- Product: typed label -> foreign key. Any label not in the palette (compared
-- ignoring case) is kept by adding it as a new color with a neutral swatch.
ALTER TABLE "Product" ADD COLUMN "colorId" TEXT;

INSERT INTO "Color" ("id", "name", "hex", "updatedAt")
SELECT 'color_' || md5(lower(t.name)), t.name, '#9ca3af', CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (lower(trim("color"))) trim("color") AS name
  FROM "Product"
  WHERE "color" IS NOT NULL AND trim("color") <> ''
) t
WHERE NOT EXISTS (SELECT 1 FROM "Color" c WHERE lower(c."name") = lower(t.name));

UPDATE "Product" p SET "colorId" = c."id"
FROM "Color" c
WHERE p."color" IS NOT NULL AND lower(c."name") = lower(trim(p."color"));

ALTER TABLE "Product" DROP COLUMN "color";
CREATE INDEX "Product_colorId_idx" ON "Product"("colorId");
ALTER TABLE "Product" ADD CONSTRAINT "Product_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "Color"("id") ON DELETE SET NULL ON UPDATE CASCADE;
