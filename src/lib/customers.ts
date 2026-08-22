// Balances now live in the receivables engine (which also powers aging and handles
// split payments, credit notes and voided bills). Re-exported here so existing
// imports keep working.
export {
  getCustomerBalances,
  getCustomerBalance,
  getCustomerLedgers,
  getTotalReceivable,
  sumLines,
  lineTotal,
} from "@/lib/receivables";
