-- CreateTable
CREATE TABLE "QuotationPayment" (
    "id" TEXT NOT NULL,
    "quotationId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amountPaisa" INTEGER NOT NULL,
    "chequeNumber" TEXT,
    "chequeBank" TEXT,
    "chequeDate" TEXT,

    CONSTRAINT "QuotationPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuotationPayment_quotationId_idx" ON "QuotationPayment"("quotationId");

-- AddForeignKey
ALTER TABLE "QuotationPayment" ADD CONSTRAINT "QuotationPayment_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
