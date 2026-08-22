---
name: Workshop
status: CANONICAL — this is the design reference for this codebase
stance: The working list is the hero. Warm, unhurried, built so a non-technical shopkeeper never has to hunt for the next action.
derived_from: [Wise, IBM Carbon, Airtable, Stripe]
chosen: 2026-08-15
alternatives_considered: [DESIGN-ledger.md, DESIGN-workshop.md, DESIGN-console.md]

# ─── STRUCTURE ───────────────────────────────────────────────────────────────
layout:
  shell: topbar                  # horizontal primary nav; full page width goes to data
  nav_grouping: grouped          # 4 sections in the top bar, sub-pages as tabs beneath
  metrics: demoted               # metrics live in a right rail, never as a row of equal cards
  primary_content: grouped-table # rows clustered under sticky group headers with aggregates
  surfaces: panelled             # white panels on a warm ground; no floating cards
  actions: sticky-bar            # long forms get a persistent footer with the running total
  density_mode: zoned            # dense inside tables, roomy in summaries and forms
  focal_element: >
    The working list itself — bills, grouped, at full page width. On an operational tool the
    thing you came to do should be the biggest thing on screen, not the total of what you
    already did.

color:
  bg: "#f4f1ea"           # warm oat ground — the defining mood
  surface: "#ffffff"
  surface_alt: "#faf8f4"  # table hover, group-header fill, sunken areas
  border: "#e6e0d5"       # warm hairline
  border_strong: "#cdc4b4"
  text: "#1a1814"         # warm near-black
  text_muted: "#5f584c"
  text_faint: "#6f6859"   # was #8f8778 — that measured 3.15:1 on bg, failing AA
  accent: "#0f5f6b"       # deep teal — CONFIRMED
  accent_hover: "#0c4e58"
  accent_press: "#093c44"
  accent_soft: "#e0eef0"
  accent_fg: "#ffffff"
  success: "#26682f"      # darkened: #2f7d3a was 4.42:1 inside success_soft
  success_soft: "#e6f2e4"
  warning: "#8a4f0a"      # darkened: #b4690e was 3.69:1 inside warning_soft
  warning_soft: "#fbeedb"
  danger: "#b3261e"
  danger_soft: "#f9e7e5"
  info: "#0f5f6b"

typography:
  font_ui: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
  font_mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
  scale: [12, 13, 14, 15, 16, 18, 22, 30]
  base: 15                 # CONFIRMED — not 14
  weights: { normal: 400, medium: 500, semibold: 600 }
  line_height: { tight: 1.3, base: 1.5, relaxed: 1.65 }
  numerals: tabular
  tracking: { display: "-0.01em", body: "0.16px", eyebrow: "0.08em" }

space:
  unit: 4
  scale: [4, 8, 12, 16, 24, 32, 48, 64]

radius: { sm: 6, md: 10, lg: 14, pill: 999 }

elevation:
  strategy: both
  shadow_sm: "0 1px 2px rgba(26, 24, 20, 0.05)"
  shadow_md: "0 8px 24px rgba(26, 24, 20, 0.10)"

density:
  row_height: 44           # CONFIRMED — comfortable, no toggle
  cell_padding_x: 16
  cell_padding_y: 12
  control_height: 40
  form_field_max_width: 480
  topbar_height: 56
  rail_width: 300
  page_max_width: 1520

# Group-by is a USER CONTROL, not a fixed choice — CONFIRMED in review.
grouping:
  control: segmented        # "Group by  [Date] [Customer]" at the right of the filter row
  state: url                # ?group=date|cust — matches the existing searchParams pattern
  default: date             # matches the current newest-first ordering
  per_page:
    billing:   { default: date,     alt: customer }
    purchases: { default: date,     alt: supplier }
    expenses:  { default: month,    alt: category }
    cheques:   { default: status,   alt: month }
    returns:   { default: date,     alt: customer }
    others:    none          # pages below ~20 rows render ungrouped

motion:
  duration: { fast: 140, base: 200, slow: 280 }
  easing: "cubic-bezier(0.22, 1, 0.36, 1)"
  policy: >
    Motion confirms that something happened — a saved row settles, a group collapses, a
    toast arrives. It never decorates and never delays input. Nothing animates on page load.
---

# Workshop — canonical design reference

> Point any future agent session at this file when adding a page and the result will match.
> If you change something by hand, update this file too, or the two drift apart.

## Visual theme & atmosphere

Warm oat paper, white working panels, deep teal for anything you can act on. It feels closer
to a well-organised counter than to a database console — larger type, taller rows, more air
between things. A first-time staff member should be able to find "New bill" without being shown.

The accepted trade: roughly 20% fewer rows on screen than a maximally dense layout, in exchange
for legibility and approachability.

## Colour roles

- **`accent` (#0f5f6b, deep teal)** — primary buttons, active nav tab and page tab, links,
  focus rings, active segmented-control segment. Teal rather than green **specifically so it
  never competes with `success`**. One filled accent button per panel.
- **`bg` (#f4f1ea)** — the warm ground *is* the elevation system. White panels read as raised
  because they sit on oat. Never put a white block on a white block.
- **`success` / `warning` / `danger`** — reserved for state: Paid / owing / overdue / low stock /
  voided. Never for emphasis or decoration.
- **`*_soft` tints** — status pill fills, group-header backgrounds, active segment fill only.

**Never:** accent on large surfaces, a page background other than `bg`, gradients, a second
accent, warning-amber on anything that isn't a warning.

## Typography

IBM Plex Sans — SIL OFL licensed, humanist, holds up at 13px in a table. Keep Carbon's
`letter-spacing: 0.16px` on body sizes; it is a real legibility detail.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Page title | 30 | 600 | tracking -0.01em |
| Panel heading | 18 | 600 | |
| Group header (in table) | 13 | 600 | uppercase, tracking 0.08em, `text_muted` |
| Table header | 13 | 500 | `text_muted` |
| Body / table cell | 15 | 400 | tracking 0.16px |
| Rail stat figure | 22 | 600 | mono, tabular |
| Rail stat label | 13 | 400 | `text_muted` |
| Meta / helper | 13 | 400 | `text_faint` |

**Mono + `font-variant-numeric: tabular-nums` is mandatory** on: PKR amounts, quantities,
stock counts, bill and invoice numbers, product codes, cheque numbers, dates inside tables,
percentages. Set `letter-spacing: 0` on mono — the 0.16px body tracking must not carry over.

Prose caps at **72 characters**.

## Layout & density

- **Top bar, 56px**, `surface`, bottom hairline. Left: business name + its tagline.
  Centre: four sections — **Sell · Stock · Money · Admin**. Right: user name + role.
- **Tab row** beneath the top bar holds the active section's pages, so the 14 destinations are
  never all visible at once. Map:
  - **Sell** — Dashboard, Billing, Returns
  - **Stock** — Products / Stock, Purchases
  - **Money** — Who owes me, Customers (Udhaar), Suppliers, Cheques, Cash & Bank, Expenses, Reports
  - **Admin** — Activity log, Users
  Owner-only pages are filtered by `navFor(role)` exactly as today; a section with no visible
  pages is hidden entirely.
- Content max-width 1520px, page padding 32px.
- **Two-column body** on dashboard and record pages: working panel (flex) + 300px right rail.
  Below 1100px the rail moves beneath the panel.
- **Zoned density** — table rows 44px; form controls 40px with 20px gaps; rail and summary
  blocks 20–24px padding.

## Components

**Buttons** — height 40px, radius 10px, 15px/600, padding 0 20px.
- *Primary:* `accent` fill, white. Hover `accent_hover`. Active `accent_press`.
  Focus-visible: 3px `accent_soft` ring + 1px `accent` border.
- *Secondary:* `surface`, 1px `border_strong`, `text`. Hover `surface_alt`.
- *Danger:* `danger` fill, white. Destructive confirmation only — delete/void triggers in a
  table row are a trailing menu item in `danger` text, not a red button per row.
- *Quiet:* transparent, `accent` text, hover `accent_soft` fill.
- *Small (`sm`)*: height 34px, 14px, padding 0 14px — for filter rows and panel headers.
- Disabled: 45% opacity, `cursor: not-allowed`, no hover change.

**Inputs / selects** — height 40px, radius 10px, 1px `border_strong`, `surface`, 15px.
- Focus: 1px `accent` border + 3px `accent_soft` ring.
- Error: `danger` border + 13px `danger` message beneath. **Never colour alone** — always text.
- Disabled: `surface_alt` fill, `text_faint`.
- Field max-width 480px; amount and quantity fields 180px; **no full-width text inputs.**
- Amount/quantity inputs are mono, tabular, right-aligned.

**Panels** (replacing the current `Card`) — `surface`, radius 14px, 1px `border`, `shadow_sm`.
`.pad` variant adds 24px padding; tables sit flush with no padding.
A panel is a *region of the page*, so a page has two or three, not eight. If each small thing
is getting its own panel, use a list inside one panel instead.

**Grouped table** — the signature component.
- **Sticky group header**: `surface_alt` fill, hairline top and bottom, 13px uppercase label
  left, aggregate right — `3 bills · Rs 177,950 · Rs 18,600 owing`. The owing figure in the
  aggregate uses `warning`.
- The **second column swaps with the grouping key** so it is never repeated: grouped by date →
  column 2 is Customer; grouped by customer → column 2 is Date.
- Row 44px, bottom hairline. Hover `surface_alt`. Selected `accent_soft`.
- Numerics right-aligned, mono, tabular. Column widths fixed so figures align across groups.
- Row actions collapse into a **trailing menu button** (`⋯`, **32px**, radius 6px) on any table
  with more than four columns. 32px is the dense-pointer floor; 28px was below it. Inline links on every row are noise on a wide table.
- Voided rows: 55% opacity + a `Voided — <reason>` pill. Never rely on opacity alone.
- Ungrouped fallback for pages under ~20 rows — same row styling, no group headers.

**Segmented control** (group-by switch) — 34px, two or three segments, joined, radius 8px on
the outer corners only. Resting: `surface`, 1px `border_strong`, `text_muted`. Active:
`accent_soft` fill, `accent` text, `accent` border. Preceded by a 13px `text_muted` "Group by"
label. Sits at the **right end of the filter row** (`margin-left: auto`).

**Status pills** — 13px/500, radius pill, 4px/10px, `*_soft` fill + solid semantic text,
`letter-spacing: 0`. **Always carry a word** — "Paid", "Rs 18,600 owing", "Overdue 62d".
Never a bare dot.

**Sticky action bar** — new bill / new purchase / edit forms: sticky bottom, `surface`, top
hairline, **upward** shadow `0 -8px 24px rgba(26,24,20,0.10)` (the bar sits at the bottom of
the viewport, so a downward shadow casts into nothing), radius `0 0 14px 14px` when inside a panel. Running totals left in
22px mono (Bill total, and On udhaar in `warning`), actions right.

**Tabs** — 15px/500, 11px vertical padding, active gets a 2px `accent` bottom border and
`text` colour; inactive `text_muted`.

**Filter row** — inside the panel, 16px/24px padding, bottom hairline, `display:flex`, 10px gap.

**Pagination** — below the panel, outside it. 13px `text_muted` range on the left
("31–60 of 214"), secondary `sm` Prev/Next on the right.

**Toasts** — bottom-right, `surface`, radius 10px, `shadow_md`, 4px left border in the
semantic colour.

**Empty state** — inside the panel, 48px padding, centred, 15px `text_muted`, one primary button.

**Skeletons** — `surface_alt` blocks at the real row height (44px), radius 6px, no shimmer sweep.

## Page-kind rules

- **Index / table** (billing, products, customers, purchases, suppliers, cheques, cash-bank,
  expenses, returns, activity, users, aging) — page header with title + primary action, then
  one full-width panel containing the filter row and the grouped table. Pagination below the
  panel. Grouping per the `grouping.per_page` map.
- **Detail / record** (customers/[id], purchases/[id]) — left panel holds the ledger or line
  items with a running balance column; right rail holds the outstanding figure at 30px mono,
  oldest-invoice age, contact details, and the primary action button full-width. This is the
  page where the rail earns its place.
- **Form / editor** (9 pages) — single column inside one padded panel, 480px fields, labels
  above at 13px/500. Line-item forms (bill, purchase) render lines as a bordered inner table
  with a sticky action bar carrying the running total.
- **Dashboard** — working list first, full panel width, grouped by day. Metrics in the right
  rail stacked one per line. Low stock and cheques-due are **rail lists, not equal-weight
  cards** — this is the specific fix for the old four-card row.
- **Auth (login)** — centred 400px panel on `bg`, 32px padding, business name at 22px, same
  tokens throughout. First impression; do not leave it on defaults.
- **Empty / error / 404** — panel, 48px padding, 15px `text_muted`, one action.
- **Print (billing/[id]/print, challan)** — **structure unchanged.** Inherits IBM Plex Sans and
  tabular numerals only. `@media print` must force `background: #fff`, drop `bg`, the accent,
  panel radius and all shadows. A customer-facing document must not carry app chrome.

## Motion

- Hover / focus colour: 140ms.
- Group collapse / expand: height + opacity, 200ms, `cubic-bezier(0.22, 1, 0.36, 1)`.
- Sticky bar appearing when a form becomes dirty: 200ms, slide up 8px + fade.
- Toast: 200ms in, 280ms out.
- Saved-row confirmation: `success_soft` background flash, 600ms fade-out, **no movement**.
- **Never:** page-load animations, scroll reveals, parallax, hover scale, spinners past 1s
  (use skeletons), anything that delays typing.
- `@media (prefers-reduced-motion: reduce)` — collapse and slide become instant; keep opacity
  fades at 100ms.

## Do's and don'ts

- **Do** group table rows under sticky headers with an aggregate, and expose the group-by
  switch where the map above defines one.
- **Do** put the working list above the metrics, never below.
- **Do** keep base type at 15px and the 0.16px body tracking — and reset tracking to 0 on mono.
- **Do** render every PKR figure and every quantity in mono, tabular, right-aligned.
- **Do** collapse row actions into a trailing menu on tables with more than four columns.
- **Do** force the print stylesheet back to plain white.
- **Don't** use green for the accent; `success` needs it.
- **Don't** wrap a table in a permanently-scrolling container — it breaks sticky headers and
  clips row menus. `.tablewrap` exists for this.
- **Don't** use `success`/`warning` for a *category* — cheque direction, user role, audit action
  type and refund method are categories, not states. They take the neutral pill.
- **Don't** create a panel per item — two or three panels per page maximum.
- **Don't** put a shadow on a table row, a status pill, or a group header.
- **Don't** let a text input span the full page width.
- **Don't** exceed radius 14px; 20px on a data panel reads as a consumer app.
- **Don't** put anything urgent in the right rail — it is context, not the primary path.
- **Don't** reintroduce `neutral-*` Tailwind colours; every colour comes from a token here.

## Accessibility

- 15px base with warm-dark ink gives body text 13.8:1 on `surface`.
- `accent` #0f5f6b on white is 7.2:1 — safe for text and focus rings.
- `text_faint` #6f6859 on `bg` is 4.90:1 and on `surface` 5.52:1. Still **meta only** by role
  (timestamps, hints, placeholders) — but it no longer fails if it lands on a real value.
  The earlier #8f8778 measured **3.15:1** and was being used for audit notes, return reasons
  and rail headings; that was a genuine failure, not a stylistic preference.
- Focus-visible is 3px and present on every interactive element, including row menu buttons
  and segmented-control segments. Never `outline: none` without a replacement.
- Touch targets 44px minimum — already satisfied by the 44px row height and 40px controls.
- Status is never colour-only; the pill text carries the meaning, and `success`/`warning` also
  differ in fill lightness so they separate in greyscale.
- The existing mobile stacked-card table view (`table.rtable`) is retained and re-tokenised;
  group headers become sticky section labels in that view.
