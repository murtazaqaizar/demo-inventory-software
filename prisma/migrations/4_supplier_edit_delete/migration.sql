-- Add/Edit/Delete for suppliers and purchases.
--
-- 1. Supplier.active — a supplier with purchases or ledger history is hidden
--    rather than deleted, so payables and landed-cost history stay intact.
--    Same pattern as Customer.active (migration 2).
-- 2. SupplierLedgerEntry.purchaseId — links the CHARGE row raised by a credit
--    purchase back to that purchase, so editing/deleting the purchase can
--    reverse the payable exactly instead of matching on the note text.
--
-- Additive only: no columns or tables dropped, no data rewritten except the
-- backfill below, which only fills the new column.

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SupplierLedgerEntry" ADD COLUMN     "purchaseId" TEXT;

-- CreateIndex
CREATE INDEX "SupplierLedgerEntry_purchaseId_idx" ON "SupplierLedgerEntry"("purchaseId");

-- AddForeignKey
ALTER TABLE "SupplierLedgerEntry" ADD CONSTRAINT "SupplierLedgerEntry_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: existing credit-purchase charges were tagged with the note
-- 'Purchase <last 6 chars of the purchase id>'. Link those to their purchase
-- where that match is unambiguous.
UPDATE "SupplierLedgerEntry" e
SET "purchaseId" = p."id"
FROM "Purchase" p
WHERE e."purchaseId" IS NULL
  AND e."direction" = 'CHARGE'
  AND e."supplierId" = p."supplierId"
  AND e."note" = 'Purchase ' || RIGHT(p."id", 6);
