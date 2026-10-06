import type { Role } from "@/generated/prisma/enums";

// Four sections carry the top bar; a flat list of fourteen gives no sense of
// which pages are daily and which are monthly (see design/DESIGN.md).
export const SECTIONS = ["Sell", "Stock", "Money", "Admin"] as const;
export type Section = (typeof SECTIONS)[number];

export type NavItem = {
  href: string;
  label: string;
  section: Section;
  ownerOnly: boolean; // true = hidden from STAFF and blocked server-side
};

// Staff see day-to-day billing & stock. Money side (cost, profit, payables,
// cash/bank, cheques, expenses, reports, users) is OWNER-only per spec §5 + feature 30.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", section: "Sell", ownerOnly: false },
  { href: "/billing", label: "Billing", section: "Sell", ownerOnly: false },
  { href: "/returns", label: "Returns", section: "Sell", ownerOnly: false },
  { href: "/products", label: "Products / Stock", section: "Stock", ownerOnly: false },
  { href: "/categories", label: "Categories & colors", section: "Stock", ownerOnly: false },
  { href: "/purchases", label: "Purchases", section: "Stock", ownerOnly: true },
  { href: "/aging", label: "Who owes me", section: "Money", ownerOnly: true },
  { href: "/customers", label: "Customers (Udhaar)", section: "Money", ownerOnly: false },
  { href: "/suppliers", label: "Suppliers (Payables)", section: "Money", ownerOnly: true },
  { href: "/cheques", label: "Cheques", section: "Money", ownerOnly: true },
  { href: "/cash-bank", label: "Cash & Bank", section: "Money", ownerOnly: true },
  { href: "/expenses", label: "Expenses", section: "Money", ownerOnly: true },
  { href: "/reports", label: "Reports", section: "Money", ownerOnly: true },
  { href: "/activity", label: "Activity log", section: "Admin", ownerOnly: true },
  { href: "/users", label: "Users", section: "Admin", ownerOnly: true },
  { href: "/settings", label: "Shop details", section: "Admin", ownerOnly: true },
];

export function navFor(role: Role): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.ownerOnly || role === "OWNER");
}

/**
 * Group the role's visible items into sections, dropping any section the role
 * cannot see at all — a STAFF user gets no empty "Admin" tab.
 */
export function sectionsFor(role: Role): { section: Section; items: NavItem[] }[] {
  const visible = navFor(role);
  return SECTIONS.map((section) => ({
    section,
    items: visible.filter((i) => i.section === section),
  })).filter((g) => g.items.length > 0);
}

/** Longest-prefix match, so /billing/new highlights Billing rather than Dashboard. */
export function activeItem(pathname: string, items: NavItem[]): NavItem | undefined {
  return items
    .filter((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
