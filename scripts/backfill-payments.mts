import "dotenv/config";
import { prisma } from "../src/lib/prisma.ts";

// One-off: existing invoices predate split payments. Under the new model every invoice
// is a charge on the customer and money received is recorded in InvoicePayment.
// So any old non-UDHAAR invoice needs a payment row for its full total, otherwise
// previously-settled cash sales would suddenly look like debts.
async function main() {
  const invoices = await prisma.invoice.findMany({
    include: { items: true, payments: true },
  });

  let created = 0,
    skipped = 0;

  for (const inv of invoices) {
    if (inv.payments.length > 0) {
      skipped++;
      continue;
    }
    if (inv.method === "UDHAAR") {
      skipped++;
      continue; // genuinely unpaid — leave as outstanding
    }
    const total = inv.items.reduce(
      (s, it) => s + (it.isSample ? 0 : it.ratePaisa * it.quantity),
      0
    );
    if (total <= 0) {
      skipped++;
      continue;
    }
    await prisma.invoicePayment.create({
      data: {
        invoiceId: inv.id,
        method: inv.method,
        amountPaisa: total,
        createdAt: inv.date,
      },
    });
    created++;
  }

  console.log(`Backfill done: ${created} payment rows created, ${skipped} skipped.`);
}

main().finally(() => prisma.$disconnect());
