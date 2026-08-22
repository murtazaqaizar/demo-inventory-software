import { prisma } from "@/lib/prisma";
import { requireOwnerPage } from "@/lib/guards";
import { getAccountBalances } from "@/lib/money-accounts";
import { formatPKR } from "@/lib/money";
import {
  EmptyState,
  Panel,
  PanelHeader,
  PageHeader,
  Rail,
  RailBlock,
  RailStat,
  rowClass,
  tableClass,
  tdClass,
  tdNumClass,
  thClass,
  thNumClass,
} from "@/components/ui";
import { CashForms } from "./cash-forms";

const typeLabel: Record<string, string> = {
  SALE_RECEIPT: "Sale receipt",
  CUSTOMER_PAYMENT: "Customer payment",
  SUPPLIER_PAYMENT: "Supplier payment",
  EXPENSE: "Expense",
  DRAWING: "Owner drawing",
  CHEQUE_CLEAR: "Cheque cleared",
  TRANSFER: "Transfer",
  ADJUST: "Adjustment",
};

export default async function CashBankPage() {
  await requireOwnerPage();

  const accounts = await getAccountBalances();
  const movements = await prisma.moneyMovement.findMany({
    orderBy: { date: "desc" },
    take: 25,
    include: { account: true },
  });

  const combined = accounts.reduce((s, a) => s + a.balancePaisa, 0);

  return (
    <div>
      <PageHeader
        title="Cash & Bank"
        description="Cash-in-hand and bank tracked separately. Record owner withdrawals, transfers and opening balances."
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="mb-6">
            <CashForms
              accounts={accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind }))}
            />
          </div>

          <Panel>
            <PanelHeader title="Recent money movements" />
            {movements.length === 0 ? (
              <EmptyState>No movements yet.</EmptyState>
            ) : (
              <div className="tablewrap">
                <table className={tableClass}>
                  <thead>
                    <tr>
                      <th className={thClass}>Date</th>
                      <th className={thClass}>Account</th>
                      <th className={thClass}>Type</th>
                      <th className={thClass}>Note</th>
                      <th className={thNumClass}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id} className={rowClass}>
                        <td
                          className={`${tdClass} font-mono text-ink-muted`}
                          data-label="Date"
                        >
                          {m.date.toLocaleDateString("en-PK")}
                        </td>
                        <td className={tdClass} data-label="Account">
                          {m.account.name}
                        </td>
                        <td className={`${tdClass} text-ink-muted`} data-label="Type">
                          {typeLabel[m.type] ?? m.type}
                        </td>
                        <td className={`${tdClass} text-ink-muted`} data-label="Note">
                          {m.note ?? "—"}
                        </td>
                        <td
                          data-label="Amount"
                          className={`${tdNumClass} font-medium ${
                            m.amountPaisa < 0 ? "text-bad" : "text-ok"
                          }`}
                        >
                          {m.amountPaisa < 0 ? "−" : "+"}
                          {formatPKR(Math.abs(m.amountPaisa))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <Rail>
          <RailBlock title="Balances">
            {accounts.map((a) => (
              <RailStat key={a.id} label={a.name} value={formatPKR(a.balancePaisa)} />
            ))}
            {accounts.length > 1 && (
              <RailStat label="Combined" value={formatPKR(combined)} />
            )}
          </RailBlock>
        </Rail>
      </div>
    </div>
  );
}
