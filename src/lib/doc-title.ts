// The browser offers a printed page's <title> as the PDF file name. Giving each
// bill, challan and quotation its own title means "Save as PDF" suggests
// "Bill 12 - Agha Bhai" instead of the app's name for every document.
import type { Metadata } from "next";

export function docTitle(kind: string, ref: string, customer?: { name: string; isCashCustomer?: boolean } | null): Metadata {
  const who = customer ? (customer.isCashCustomer ? "Cash Sale" : customer.name.trim()) : "";
  // Characters Windows refuses in file names would be swapped by the browser anyway.
  const clean = (s: string) => s.replace(/[\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();
  const head = [kind, ref].filter(Boolean).join(" ");
  return { title: { absolute: clean(who ? `${head} - ${who}` : head) } };
}
