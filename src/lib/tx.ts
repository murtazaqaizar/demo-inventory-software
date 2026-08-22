// Prisma closes an interactive transaction 5s after it opens, and every
// statement inside costs a network round-trip to hosted Postgres. A per-row
// loop over a real document (a ten-line bill, a big purchase) crossed that
// limit and the save failed with P2028 — see guide/DEBUG_LOG.md.
//
// The fix was to batch the writes so each document costs a fixed handful of
// statements. These options are the safety margin for a slow connection on top
// of that, NOT licence to put per-row loops back inside a transaction.
//
//   maxWait — how long to queue for a connection before giving up
//   timeout — how long the transaction may stay open once it has one
export const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };
