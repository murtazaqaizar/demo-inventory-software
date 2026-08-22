// Postgres SUM() over an integer column returns bigint, which the pg driver hands
// back as a string. Every paisa total in this app is far inside Number's safe
// integer range, so widening to Number is lossless here.
export function num(v: unknown): number {
  if (v === null || v === undefined) return 0;
  return typeof v === "number" ? v : Number(v);
}
