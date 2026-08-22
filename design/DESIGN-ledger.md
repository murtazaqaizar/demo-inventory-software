---
name: Ledger
stance: A well-kept paper ledger rendered in software — quiet surfaces, ink-dark text, colour only where it carries meaning.
derived_from: [Linear, Stripe, IBM Carbon]

# ─── STRUCTURE (decided first) ───────────────────────────────────────────────
layout:
  shell: grouped-sidebar
  nav_grouping: grouped          # Sell · Stock · Money · Admin — not 14 flat links
  metrics: inline-strip          # no metric cards at all; figures sit on the canvas
  primary_content: dense-table
  surfaces: flat                 # hairline rules only — zero cards anywhere
  actions: toolbar
  density_mode: uniform
  focal_element: >
    The single money figure that answers "how am I doing" — Sales this month for staff,
    Owed to you for the owner — set at 40px. Everything else on the strip is 20px.
    One number earns the size; the rest are context.

color:
  bg: "#f6f7f9"           # cool paper
  surface: "#ffffff"
  surface_alt: "#f0f2f5"  # table hover, zebra, sunken toolbar
  border: "#e2e6ec"       # standard hairline
  border_strong: "#c8cfd9" # input borders, table head underline
  text: "#14171c"
  text_muted: "#5a6472"
  text_faint: "#8a94a3"
  accent: "#2457a8"       # considered mid-navy — NOT the default indigo
  accent_hover: "#1d4a91"
  accent_press: "#173c76"
  accent_soft: "#e8eef8"  # selected row, active nav fill
  accent_fg: "#ffffff"
  success: "#1f7a3d"
  success_soft: "#e4f2e8"
  warning: "#9a6100"
  warning_soft: "#fbf0dc"
  danger: "#b3261e"
  danger_soft: "#fbeae9"
  info: "#2457a8"

typography:
  font_ui: "Inter, ui-sans-serif, system-ui, sans-serif"
  font_mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
  scale: [11, 12, 13, 14, 16, 20, 26, 40]
  base: 14
  weights: { normal: 400, medium: 500, semibold: 600 }
  line_height: { tight: 1.25, base: 1.5, relaxed: 1.6 }
  numerals: tabular
  tracking: { display: "-0.02em", body: "0", eyebrow: "0.06em" }

space:
  unit: 4
  scale: [4, 8, 12, 16, 24, 32, 48, 64]

radius: { sm: 3, md: 5, lg: 6, pill: 999 }

elevation:
  strategy: borders
  shadow_sm: "none"
  shadow_md: "0 4px 12px rgba(20, 23, 28, 0.08)"   # dropdowns and modals only

density:
  row_height: 36
  cell_padding_x: 12
  cell_padding_y: 8
  control_height: 32
  form_field_max_width: 420
  sidebar_width: 220
  page_max_width: 1440

motion:
  duration: { fast: 120, base: 180, slow: 240 }
  easing: "cubic-bezier(0.2, 0, 0, 1)"
  policy: >
    Colour and opacity only. Rows, nav items and buttons cross-fade their background.
    Nothing moves position, nothing scales, nothing bounces. A row that jumps under
    the cursor during a six-hour shift is a defect, not a delight.
---

# Ledger

## Visual theme & atmosphere

Reads like a ledger book that happens to be on a screen: cool paper ground, ink-dark text,
ruled lines instead of boxes. There are no cards — content sits directly on the canvas,
separated by 1px rules. The eye travels down columns, not across boxes. Colour appears
roughly four times per screen and every appearance means something.

This is the direction for someone who has the app open all day and wants to see the most
rows possible without eye strain.

## Colour roles

- **`accent` (#2457a8)** — filled primary buttons, active nav item, focus rings, links.
  Deliberately a mid-navy rather than the default agent indigo. **Never decorative.**
  At most **one filled accent button per screen**; secondary actions are outlined or plain text.
- **`accent_soft`** — selected table row, active nav background. Never on text.
- **`success` / `warning` / `danger`** — status only: Paid, owing, overdue, low stock, voided.
  These must never be used for emphasis or decoration, or they stop meaning anything.
- **Greys carry the entire rest of the interface.** If a colour is not communicating state
  or marking the primary action, it should be grey.

**Never:** accent-coloured headings, coloured card backgrounds, gradients, a second accent.

## Typography

Inter for UI; IBM Plex Mono for anything a person would compare down a column.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Hero figure (stat strip) | 40 | 600 | tracking -0.02em, mono, tabular |
| Page title | 20 | 600 | |
| Section heading | 14 | 600 | |
| Eyebrow / stat label | 11 | 500 | uppercase, tracking 0.06em, `text_muted` |
| Table header | 12 | 500 | `text_muted`, not uppercase |
| Body / table cell | 13 | 400 | |
| Supporting stat figure | 20 | 600 | mono, tabular |
| Meta / helper | 12 | 400 | `text_faint` |

**Mono + `font-variant-numeric: tabular-nums` is mandatory** on: all PKR amounts, quantities,
stock counts, invoice and bill numbers, product codes, dates in tables, and percentages.
This is the single highest-value change in the whole direction — it is what makes a column
of money readable.

Prose (descriptions, help text) caps at **68 characters**.

## Layout & density

- Grouped sidebar, 220px, fixed, `surface` background with a right hairline.
  Groups: **Sell** (Dashboard, Billing, Returns) · **Stock** (Products, Purchases) ·
  **Money** (Who owes me, Customers, Suppliers, Cheques, Cash & Bank, Expenses, Reports) ·
  **Admin** (Activity, Users). Group labels are 11px eyebrow style, `text_faint`.
- Page padding 24px; content max-width 1440px, tables allowed full bleed.
- **Row height 36px** — decided, not inherited. Compact, for long shifts.
- Density does not change between page kinds. Uniform grid everywhere. Forms get more
  vertical air only through field spacing (16px), not by changing control height.

## Components

**Buttons** — height 32px, radius 5px, 13px/500, padding 0 12px.
- *Primary:* `accent` fill, white text. Hover `accent_hover`. Active `accent_press`.
  Focus-visible: 2px `accent` ring at 40% opacity, 2px offset. Disabled: 40% opacity, no pointer.
- *Secondary:* `surface` fill, 1px `border_strong`, `text`. Hover `surface_alt`.
- *Danger:* `danger` fill, white text. Used only for destructive confirmation, never as the
  resting state of a delete link — delete links are plain text in `danger`.
- *Ghost / link:* `accent` text, no fill, underline on hover.

**Inputs / selects** — height 32px, radius 5px, 1px `border_strong`, `surface` fill, 13px.
- Focus: border `accent` + 2px `accent` ring at 30%. Never remove the outline without replacing it.
- Error: border `danger`, message 12px `danger` beneath, plus text — never colour alone.
- Disabled: `surface_alt` fill, `text_faint`.
- Field max-width 420px. **Inputs must not stretch to the page width** — a full-bleed text
  field on a 1440px screen is the clearest single sign of an unstyled form.

**Tables** — the centrepiece.
- No card wrapper. No outer radius. The table sits on the canvas.
- Header: 12px/500 `text_muted`, `surface_alt` fill, 1px `border_strong` bottom rule, sticky at top.
- Rows: 36px, 1px `border` bottom hairline, `surface` background.
- Hover: `surface_alt`. Selected: `accent_soft` + 2px `accent` left marker.
- Numeric columns **right-aligned**, mono, tabular. Text columns left-aligned.
- Zebra striping: **off**. Hairlines are enough; stripes plus hairlines is noise.
- Empty state: 13px `text_muted`, centred, 48px vertical padding, one plain-text action.

**Status pills** — 11px/500, radius pill, 2px/8px padding, `*_soft` fill with the matching
solid colour as text. **Always carry a word** ("Paid", "Overdue 62d"), never a bare colour dot.

**Toolbar** — search + filters in a 48px strip above the table, `surface` with a bottom hairline.
Primary action sits at the right of the toolbar, not floating.

**Pagination** — plain text `text_muted`, "31–60 of 214", prev/next as ghost buttons. No page numbers.

**Modals** — `surface`, radius 6px, `shadow_md`, 1px `border`, scrim `rgba(20,23,28,0.4)`.

## Page-kind rules

- **Index / table** — toolbar, then table, then pagination. Nothing else.
- **Detail (customer ledger, purchase)** — 2-column label/value block at the top on the canvas
  (labels 12px `text_muted` left, values 13px mono right), then the transaction table below.
  The running balance is the hero figure at 26px.
- **Form** — single column, 420px fields, labels above at 12px/500. Long forms (new bill,
  new purchase) get a **sticky bottom bar** with the total on the left and Save on the right.
- **Dashboard** — inline stat strip on the canvas: one 40px hero figure, three 20px supporting
  figures separated by vertical hairlines. Below it, two dense tables side by side
  (Low stock | Top debtors). No cards.
- **Auth** — centred 360px column on `bg`, single hairline-bordered panel, same tokens.
- **Empty / error** — `text_muted`, no illustration, one clear action.
- **Print** — inherits font and tabular numerals only. Layout untouched; no accent, no `bg`.

## Motion

- Background/border colour transitions: 120ms ease-out.
- Modal and dropdown fade + 2px rise: 180ms.
- Toasts: fade in 180ms, out 240ms.
- **Never:** row height animation, skeleton shimmer sweeps, scroll-triggered reveals,
  spring or bounce easing, hover scale.
- `@media (prefers-reduced-motion: reduce)` — all durations to 0ms except opacity fades at 100ms.

## Do's and don'ts

- **Do** render every PKR figure in mono with tabular numerals, right-aligned.
- **Do** keep exactly one filled accent button per screen.
- **Do** use hairlines for every separation. If you reach for a shadow, use a rule instead.
- **Do** pair every status colour with a word.
- **Don't** wrap tables in cards. There are no cards in this direction.
- **Don't** let a form input span the full page width.
- **Don't** use `success`/`warning`/`danger` for anything that isn't a state.
- **Don't** add a second accent, a gradient, or a coloured heading.
- **Don't** reintroduce `rounded-xl` — the radius ceiling here is 6px.
- **Don't** animate anything that changes an element's position or size.

## Accessibility

- Body text ≥ 4.5:1 against its background; `text_muted` on `bg` measures 5.9:1, `text_faint`
  is for non-essential meta only and never for values a user must read.
- `accent` on white is 6.4:1 — safe for link text at 13px.
- Focus-visible is always present and always 2px. Never `outline: none` without a replacement.
- Hit targets ≥ 32px on pointer, ≥ 44px on touch (mobile stacked-card table view).
- Status is never communicated by colour alone — the pill text carries the meaning.
