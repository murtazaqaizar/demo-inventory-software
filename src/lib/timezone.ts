// The shop's clock. Every date is rendered on the server (toLocaleDateString,
// "today" for the date field, day filters), and Vercel's servers run in UTC —
// five hours behind Pakistan — so without this a bill made at 01:30 showed as
// the previous day and fell outside that day's filters.
//
// Node re-reads process.env.TZ whenever it is assigned, so setting it once at
// server start (src/instrumentation.ts) moves every Date on the server to it.
export const APP_TIME_ZONE = "Asia/Karachi";

export function applyAppTimeZone() {
  process.env.TZ = APP_TIME_ZONE;
}
