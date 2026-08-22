-- Performance indexes.
--
-- Every `include: { items: true }` / `include: { payments: true }` issues a
-- `WHERE "<parent>Id" IN (...)` against the child table. Without an index on the
-- FK column that is a sequential scan of the whole child table — and the line-item
-- tables are the biggest tables in the database. Same story for the receivables
-- and income-statement queries, which always filter Invoice on status + date
-- together rather than on either column alone.
--
-- Indexes only; no data or column changes.

-- CreateIndex
CREATE INDEX "PurchaseItem_purchaseId_idx" ON "PurchaseItem"("purchaseId");

-- CreateIndex
CREATE INDEX "Invoice_status_date_idx" ON "Invoice"("status", "date");

-- CreateIndex
CREATE INDEX "Invoice_customerId_status_idx" ON "Invoice"("customerId", "status");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "CreditNote_customerId_refundMethod_idx" ON "CreditNote"("customerId", "refundMethod");

-- CreateIndex
CREATE INDEX "CreditNoteItem_creditNoteId_idx" ON "CreditNoteItem"("creditNoteId");
