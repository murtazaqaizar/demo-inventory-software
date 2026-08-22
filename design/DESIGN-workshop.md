---
name: Workshop
stance: The working list is the hero. Warm, unhurried, built so a non-technical shopkeeper never has to hunt for the next action.
derived_from: [Wise, IBM Carbon, Airtable]

# ─── STRUCTURE (decided first) ───────────────────────────────────────────────
layout:
  shell: topbar                  # horizontal primary nav; full page width goes to data
  nav_grouping: grouped          # 4 top-level sections, secondary tabs within the page
  metrics: demoted               # metrics live in a right rail, below the working list on mobile
  primary_content: grouped-table # rows clustered under sticky group headers
  surfaces: panelled             # full-height white panels on a warm ground; no floating cards
  actions: sticky-bar            # long forms get a persistent footer with the running total
  density_mode: zoned            # dense inside tables, roomy in summaries and forms
  focal_element: >
    The working list itself — today's bills, grouped by customer, at full page width.
    On an operational tool the thing you came to do should be the biggest thing on screen,
    not the total of what you already did.

color:
  bg: "#f4f1ea"           # warm oat ground — the defining mood
  surface: "#ffffff"
  surface_alt: "#faf8f4"  # table hover, sunken group header
  border: "#e6e0d5"       # warm hairline
  border_strong: "#cdc4b4"
  text: "#1a1814"         # warm near-black
  text_muted: "#5f584c"
  text_faint: "#8f8778"
  accent: "#0f5f6b"       # deep teal — cool anchor against a warm ground
  accent_hover: "#0c4e58"
  accent_press: "#093c44"
  accent_soft: "#e0eef0"
  accent_fg: "#ffffff"
  success: "#2f7d3a"
  success_soft: "#e6f2e4"
  warning: "#b4690e"
  warning_soft: "#fbeedb"
  danger: "#b3261e"
  danger_soft: "#f9e7e5"
  info: "#0f5f6b"

typography:
  font_ui: "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif"
  font_mono: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
  scale: [12, 13, 14, 15, 16, 18, 22, 30]
  base: 15
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
  row_height: 44
  cell_padding_x: 16
  cell_padding_y: 12
  control_height: 40
  form_field_max_width: 480
  topbar_height: 56
  rail_width: 300
  page_max_width: 1520

motion:
  duration: { fast: 140, base: 200, slow: 280 }
  easing: "cubic-bezier(0.22, 1, 0.36, 1)"
  policy: >
    Motion confirms that something happened — a saved row settles, a group collapses, a
    toast arrives. It never decorates and never delays input. Nothing animates on page load.
---

# Workshop

## Visual theme & atmosphere

Warm oat paper, white working panels, deep teal for anything you can act on. It feels closer
to a well-organised counter than to a database console — larger type, taller rows, more air
between things. A first-time staff member should be able to find "New bill" without being shown.

The cost of that warmth is rows on screen: you see roughly 20% fewer than Ledger. That is the
deliberate trade — legibility and approachability over raw density.

## Colour roles

- **`accent` (#0f5f6b, deep teal)** — primary buttons, active nav tab, links, focus rings.
  Teal rather than green **specifically so it never competes with `success`**. One filled
  accent button per panel.
- **`bg` (#f4f1ea)** — the warm ground is the elevation system. White panels read as raised
  because they sit on oat, not because of a shadow. Do not put white on white.
- **`success` / `warning` / `danger`** — reserved for Paid / owing / overdue / low stock / voided.
- **`*_soft` tints** — status pill fills and group-header backgrounds only.

**Never:** accent on large surfaces, a coloured page background other than `bg`, gradients,
warning-amber used for anything that isn't a warning.

## Typography

IBM Plex Sans — open-licensed (SIL OFL), slightly humanist, holds up at 13px in a table.
Keep Carbon's `letter-spacing: 0.16px` on body sizes; it is a real legibility detail, not
a flourish.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Page title | 30 | 600 | tracking -0.01em |
| Panel heading | 18 | 600 | |
| Group header (in table) | 13 | 600 | uppercase, tracking 0.08em, `text_muted` |
| Table header | 13 | 500 | `text_muted` |
| Body / table cell | 15 | 400 | tracking 0.16px |
| Table cell (dense cols) | 14 | 400 | |
| Rail stat figure | 22 | 600 | mono, tabular |
| Rail stat label | 13 | 400 | `text_muted` |
| Meta / helper | 13 | 400 | `text_faint` |

Base size is **15px, not 14** — this is an app used by people who are not staring at a
27" monitor, and one step up in body size does more for perceived quality than any palette.

Mono + tabular numerals on: PKR amounts, quantities, bill numbers, product codes, cheque numbers.

Prose caps at **72 characters**.

## Layout & density

- **Top bar, 56px**, `surface` with a bottom hairline. Left: business name. Centre: four
  section links — **Sell · Stock · Money · Admin**. Right: user + sign out.
  The section's sub-pages appear as a **tab row** beneath the top bar, so the 14 destinations
  are never all visible at once.
- Content max-width 1520px, page padding 32px.
- **Two-column body on dashboard and detail pages:** working panel (flex) + 300px right rail.
  The rail holds metrics, alerts and shortcuts. On < 1100px the rail moves below the panel.
- **Zoned density** — table rows 44px; form fields 40px with 20px gaps; summary/rail blocks
  get 24px padding. Dense where you scan, roomy where you decide.

## Components

**Buttons** — height 40px, radius 10px, 15px/600, padding 0 20px.
- *Primary:* `accent` fill, white. Hover `accent_hover`. Active `accent_press`.
  Focus-visible: 3px `accent_soft` ring + 1px `accent` border.
- *Secondary:* `surface`, 1px `border_strong`, `text`. Hover `surface_alt`.
- *Danger:* `danger` fill, white.
- *Quiet:* transparent, `accent` text, hover `accent_soft` fill.

**Inputs** — height 40px, radius 10px, 1px `border_strong`, `surface`, 15px.
- Focus: 1px `accent` border + 3px `accent_soft` ring.
- Error: `danger` border, 13px `danger` message + an icon glyph — never colour alone.
- Field max-width 480px; number and amount fields 180px. **No full-width text inputs.**

**Panels** (replacing cards) — `surface`, radius 14px, 1px `border`, `shadow_sm`, 24px padding.
A panel is a *region of the page*, so pages have two or three, not eight. If you find yourself
putting each small thing in its own panel, use a list inside one panel instead.

**Grouped table** — the signature component.
- Rows cluster under a **sticky group header**: `surface_alt` fill, 13px uppercase group label
  left, aggregate right (e.g. "AHMED TRADERS — 4 bills · Rs 128,400"). This turns a flat
  44-row list into something you can scan.
  Group by: customer (billing), supplier (purchases), month (expenses, cheques), status (returns).
- Row 44px, bottom hairline `border`. Hover `surface_alt`. Selected `accent_soft`.
- Numerics right-aligned, mono, tabular. Column widths fixed so figures line up across groups.
- Row actions live in a **trailing menu button**, not four inline links — inline links across
  every row are visual noise on a wide table.

**Status pills** — 13px/500, radius pill, 4px/10px, `*_soft` fill + solid text. Always a word.

**Sticky action bar** — for new bill / new purchase / edit forms: fixed bottom, `surface`,
top hairline, `shadow_md` upward. Running total on the left in 22px mono, actions on the right.

**Tabs** — 15px/500, 12px bottom padding, active gets 2px `accent` underline + `text` colour;
inactive `text_muted`.

**Toasts** — bottom-right, `surface`, radius 10px, `shadow_md`, 4px left border in the semantic colour.

## Page-kind rules

- **Index / table** — page title + primary action in the header, filter row, then the
  **grouped** table in a single full-width panel. Pagination below, outside the panel.
- **Detail (customer ledger)** — left panel: the transaction ledger with a running balance
  column. Right rail: outstanding total (22px mono), oldest invoice age, contact, and a
  "Record payment" primary button. This is the page where the rail earns its place.
- **Form** — single column inside one panel, 480px fields, labels above at 13px/500.
  Multi-line forms (bill lines, purchase lines) render as a compact inner table with a
  sticky action bar carrying the running total.
- **Dashboard** — working list first (recent bills, grouped by day) at full panel width.
  Metrics in the right rail, stacked, one per line with a label and a 22px figure. Low-stock
  and cheques-due are rail lists, not equal-weight cards.
- **Auth** — centred 400px panel on `bg`, 32px padding, same tokens, business name at 22px.
- **Empty / error** — 15px `text_muted` inside the panel, 48px padding, one primary button.
- **Print** — inherits IBM Plex Sans + tabular numerals only. No `bg`, no accent, no radius.

## Motion

- Hover/focus colour: 140ms.
- Group collapse/expand: height + opacity, 200ms, `cubic-bezier(0.22, 1, 0.36, 1)`.
- Sticky bar entering when a form becomes dirty: 200ms slide up 8px + fade.
- Toast: 200ms in, 280ms out.
- Saved-row confirmation: `success_soft` background flash, 600ms fade-out, no movement.
- **Never:** page-load animations, scroll reveals, parallax, spinning loaders longer than 1s
  (use skeleton blocks instead), motion on anything that would delay typing.
- `prefers-reduced-motion: reduce` — collapse/slide become instant; keep opacity fades at 100ms.

## Do's and don'ts

- **Do** group table rows under sticky headers with an aggregate in the header.
- **Do** put the working list above the metrics, not below them.
- **Do** keep base type at 15px and Carbon's 0.16px body tracking.
- **Do** use the oat `bg` as the elevation cue — white panels on warm ground.
- **Do** collapse row actions into a trailing menu on tables with more than four columns.
- **Don't** use green for the accent; `success` needs it.
- **Don't** create a panel per item — two or three panels per page, maximum.
- **Don't** put a shadow on a table row or a status pill.
- **Don't** let the right rail hold anything a user needs to act on urgently — it is context,
  not the primary path. If it's urgent, it belongs in the working panel.
- **Don't** exceed radius 14px; a 20px radius on a data panel reads as a consumer app.

## Accessibility

- 15px base and warm-dark ink give body text 13.8:1 on `surface` — comfortably above AA.
- `accent` #0f5f6b on white is 7.2:1; safe for text and for a focus ring.
- `text_faint` on `bg` is 4.1:1 — **meta only**, never a value the user must read.
- Focus ring is 3px and visible on every interactive element including table row menus.
- Touch targets 44px minimum, which the 44px row height already satisfies.
- Status always carries a word; the `success`/`warning` pair is also distinguishable in
  greyscale by fill lightness.
