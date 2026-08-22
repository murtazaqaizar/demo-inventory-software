---
name: Console
stance: A billing terminal. Two panes, no navigation round-trips, keyboard before mouse — built for the person who makes forty bills a day.
derived_from: [Linear, Stripe, Sentry]

# ─── STRUCTURE (decided first) ───────────────────────────────────────────────
layout:
  shell: rail-drawer             # 56px icon rail, expands to 216px on hover/pin
  nav_grouping: grouped          # rail divided by hairline into Sell · Stock · Money · Admin
  metrics: none                  # no metric cards; one 32px status line across the top
  primary_content: master-detail # list left, record right — no page navigation to view a bill
  surfaces: layered              # canvas → panel → raised, three distinct levels
  actions: inline-row            # per-row actions + a command palette (Ctrl/Cmd-K)
  density_mode: progressive      # 32px compact default, user toggle to 40px comfortable
  focal_element: >
    The detail pane. Two-thirds of the screen is the record you are working on — the bill
    being built, the customer's ledger — because that is where the work happens. The list
    is a persistent index down the left, not a destination.

color:
  bg: "#0d0f12"           # canvas
  surface: "#14171b"      # panel
  surface_alt: "#1b1f24"  # raised / hover / selected
  border: "#252a31"
  border_strong: "#343b44"
  text: "#e9ecf0"
  text_muted: "#9aa4b0"
  text_faint: "#6b7480"
  accent: "#4d8dff"       # bright blue, legible on dark
  accent_hover: "#6b9fff"
  accent_press: "#3b78e0"
  accent_soft: "#16233a"
  accent_fg: "#0d0f12"
  success: "#3ecf7f"
  success_soft: "#12291f"
  warning: "#e0a340"
  warning_soft: "#2a2114"
  danger: "#f4685c"
  danger_soft: "#2e1613"
  info: "#4d8dff"

typography:
  font_ui: "Inter, ui-sans-serif, system-ui, sans-serif"
  font_mono: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
  scale: [10, 11, 12, 13, 15, 18, 24, 34]
  base: 13
  weights: { normal: 400, medium: 500, semibold: 600 }
  line_height: { tight: 1.2, base: 1.45, relaxed: 1.55 }
  numerals: tabular
  tracking: { display: "-0.02em", body: "0", eyebrow: "0.07em" }

space:
  unit: 4
  scale: [4, 8, 12, 16, 20, 24, 32, 48]

radius: { sm: 3, md: 4, lg: 6, pill: 999 }

elevation:
  strategy: borders
  shadow_sm: "none"
  shadow_md: "0 12px 32px rgba(0, 0, 0, 0.5)"    # command palette and modals only

density:
  row_height: 32              # comfortable mode: 40
  cell_padding_x: 10
  cell_padding_y: 6
  control_height: 28
  form_field_max_width: 380
  rail_width: 56              # expanded: 216
  list_pane_width: 380
  page_max_width: none        # full bleed; the detail pane absorbs the space

motion:
  duration: { fast: 100, base: 150, slow: 200 }
  easing: "cubic-bezier(0.2, 0, 0, 1)"
  policy: >
    Fast and functional. The detail pane cross-fades when the selected record changes;
    the command palette fades in. Nothing else moves. Under 150ms the interface feels
    instant, which is the entire point of this direction.
---

# Console

# ⚠ Read this before choosing

This direction is **dark-first**, and that is a real trade, not a style preference:

- **For:** long sessions in a shop with dim or uneven lighting; less glare at night; the
  brightest thing on screen becomes the data.
- **Against:** worse in direct daylight or a sunlit shopfront; your **print invoice and
  challan pages stay white regardless**, so there is a jarring switch every time someone
  prints; and older or lower-quality monitors render dark UIs with visible banding.

If you like the *structure* — the rail, the two-pane billing screen, the command palette —
but not the darkness, say so. The same layout works on a light palette and I will invert it.
The structure is the direction; the darkness is a setting.

## Visual theme & atmosphere

Three layered dark surfaces, hairline borders, and one bright blue that only ever marks
what is selected or actionable. Type is small and tight. The screen shows a lot and says
little. It should feel like a tool that respects your time rather than one that welcomes you.

## Colour roles

- **`accent` (#4d8dff)** — selected list row marker, primary button, focus ring, links,
  command-palette highlight. Nothing else. On dark, a bright accent is loud — use it less
  than you would on light.
- **Three surfaces do the work of depth:** `bg` canvas → `surface` panel → `surface_alt`
  raised/hover. **Shadows are for the command palette and modals only.** Never on a row,
  a panel, or a pill.
- **Semantic colours are lightened for dark** — `success` #3ecf7f and `danger` #f4685c are
  deliberately brighter than their light-mode equivalents; the light-mode values fail
  contrast on #0d0f12.
- **`*_soft` fills are very dark tints**, not pastels. A pastel pill on a dark ground glows.

**Never:** pure white (#fff) text — `text` is #e9ecf0 to cut halation. Never pure black
either; `bg` #0d0f12 keeps a faint blue cast so hairlines read.

## Typography

Inter for UI, JetBrains Mono for every figure. Base 13px — smaller than the other two
directions, which is consistent with the density stance.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Detail-pane record number | 24 | 600 | mono, tracking -0.02em |
| Status line figure | 15 | 600 | mono, tabular |
| Pane title | 15 | 600 | |
| Section eyebrow | 10 | 500 | uppercase, tracking 0.07em, `text_faint` |
| List row primary | 13 | 500 | |
| List row secondary | 11 | 400 | `text_muted` |
| Table cell | 12 | 400 | |
| Numeric cell | 12 | 400 | mono, tabular, right-aligned |
| Keyboard hint | 10 | 500 | mono, `text_faint`, in a 3px-radius `surface_alt` chip |

Every numeric is mono here — not just money. Quantities, codes, dates, cheque numbers,
percentages. In a dense dark UI, mono numerals are what stop columns from looking ragged.

## Layout & density

- **Icon rail, 56px**, `surface`, right hairline. Icons with a 10px label beneath.
  Hairline dividers split it into Sell / Stock / Money / Admin. Hover or pin expands to
  216px with full labels, overlaying content rather than pushing it.
- **Status line, 32px**, full width beneath the top of the content area: a single row of
  inline figures separated by `border` pipes — `Today Rs 84,200 · Month Rs 1.94M ·
  Owed Rs 612,000 · Low stock 7`. No cards. Owner-only figures simply omit.
- **Two-pane body** — list pane 380px fixed (`surface`, right hairline), detail pane fills
  the rest (`bg`). Selecting a row swaps the detail pane; the URL updates but the list
  never reloads. Below 1024px the panes stack and the list becomes the page.
- **Progressive density** — 32px rows default, toggle to 40px, persisted per user. The
  toggle lives in the rail footer.

## Components

**Buttons** — height 28px, radius 4px, 12px/500, padding 0 10px.
- *Primary:* `accent` fill, `accent_fg` (dark) text. Hover `accent_hover`. Active `accent_press`.
  Focus-visible: 2px `accent` ring, 1px offset.
- *Secondary:* `surface_alt` fill, 1px `border_strong`, `text`. Hover border `border_strong` → `text_faint`.
- *Ghost:* transparent, `text_muted`; hover `surface_alt` fill + `text`.
- *Danger:* `danger_soft` fill, `danger` text, 1px `danger` border at 40%. Solid `danger` fill
  is reserved for the confirm button inside a destructive modal.
- Every button that has a shortcut shows the key chip on the right at 10px mono.

**Inputs** — height 28px, radius 4px, `bg` fill (sunken, darker than the panel),
1px `border_strong`, 12px, `text`.
- Focus: border `accent` + 2px `accent` ring at 35%.
- Error: border `danger` + 11px `danger` message.
- Placeholder `text_faint`. Field max-width 380px.
- **Note:** inputs are *darker* than their surrounding panel here — the inverse of light mode,
  where inputs are lighter. Sunken is the correct read on dark.

**List pane rows** — 32px, 10px horizontal padding, bottom hairline `border`.
- Two-line variant for bills: number + customer on line 1 (13px/500), date + amount on
  line 2 (11px `text_muted`, amount mono right).
- Hover `surface_alt`. **Selected:** `accent_soft` fill + 2px `accent` left marker + `text` colour.
- Keyboard: ↑/↓ moves selection, Enter focuses the detail pane, `/` focuses search.

**Detail pane** — 24px padding. Header row: record number 24px mono, status pill, actions right.
Then a label/value grid (labels 10px eyebrow `text_faint`, values 13px), then the line-items table.

**Tables (inside detail)** — header 10px eyebrow `text_faint` with a `border_strong` bottom rule.
Rows 32px, hairline `border`. Numerics right-aligned mono. No zebra. No card wrapper.

**Status pills** — 10px/500, radius 3px (not pill — sharper suits this direction),
2px/6px padding, `*_soft` fill + solid semantic text, 1px border in the semantic colour at 30%.
Always a word.

**Command palette (Ctrl/Cmd-K)** — centred, 560px, `surface_alt`, radius 6px, 1px
`border_strong`, `shadow_md`, scrim `rgba(0,0,0,0.6)`. Fuzzy-matches pages, customers,
products and bill numbers. This is the primary navigation method; the rail is the fallback.

## Page-kind rules

- **Index / table (billing, purchases, customers, cheques)** — master/detail. The list pane
  is the index; the detail pane shows the selected record. No separate detail route needed,
  though deep links still work.
- **Detail-only (reports, activity)** — the list pane holds the report/filter list, the
  detail pane holds the output.
- **Form (new bill, new purchase)** — the form *is* the detail pane, with the list pane still
  showing recent bills for reference. Line items are a compact inner table; totals pin to the
  bottom of the detail pane. This is the direction's strongest screen: you can build a bill
  while still seeing the last ten.
- **Dashboard** — the status line plus two stacked lists in the detail pane (low stock,
  cheques due). There is no card-based dashboard in this direction, by design.
- **Auth** — centred 340px panel on `bg`, `surface` fill, 1px `border`. Dark, matching.
- **Empty / error** — 12px `text_muted`, centred, plus the relevant keyboard shortcut chip.
- **Print** — **fully overridden to light.** `@media print` forces white background and
  #000 ink. The dark palette must not leak into an invoice a customer receives.

## Motion

- Detail-pane content swap: 100ms opacity cross-fade. No slide — sliding a pane on every
  arrow-key press is nauseating at speed.
- Hover/selection colour: 100ms.
- Command palette: fade + 4px rise, 150ms in, 100ms out.
- Rail expansion: width 150ms ease-out.
- **Never:** row insertion animation, shimmer, anything over 200ms, anything that runs while
  a key is held down (arrow-key list scrubbing must be instant).
- `prefers-reduced-motion: reduce` — everything instant except a 80ms opacity fade on the palette.

## Do's and don'ts

- **Do** keep the list pane mounted; never navigate away to view a record.
- **Do** render every number in mono, not just money.
- **Do** show keyboard hints on anything that has a shortcut.
- **Do** make inputs darker than their panel.
- **Do** force the print stylesheet to light — this is non-negotiable.
- **Don't** use pure white text or pure black background.
- **Don't** put shadows on rows, pills, or panels; depth is the three-surface ladder.
- **Don't** carry light-mode semantic hexes across — they fail contrast on #0d0f12.
- **Don't** add metric cards back. The status line replaces them deliberately.
- **Don't** exceed 6px radius anywhere.

## Accessibility

- `text` #e9ecf0 on `bg` #0d0f12 is 15.1:1. `text_muted` #9aa4b0 is 7.4:1.
  `text_faint` #6b7480 is 4.0:1 — **decorative and meta only**, never a readable value.
- `accent` #4d8dff on `bg` is 6.6:1; `success` #3ecf7f 9.9:1; `danger` #f4685c 6.1:1;
  `warning` #e0a340 8.7:1. All clear AA at 12px.
- Dark mode makes focus rings harder to see — the ring is 2px with 1px offset and always
  `accent`, never a subtle grey.
- Full keyboard operation is a requirement of this direction, not an extra: every action
  reachable without a mouse, visible focus at every step, and the palette as an escape hatch.
- Hit targets are 28–32px on pointer, which is below the 44px touch guideline — **this
  direction assumes a mouse and keyboard.** Touch viewports switch to the 40px comfortable
  density automatically.
