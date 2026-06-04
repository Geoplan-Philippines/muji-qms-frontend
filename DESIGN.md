---
name: MUJI Queue
description: Across-the-room queue board and counter station for a Muji coffeeshop.
colors:
  muji-red: "#a3212f"
  muji-red-deep: "#8b0f20"
  muji-red-tint: "#ffe8e6"
  ink: "#272322"
  ink-soft: "#615956"
  ink-faint: "#8d8481"
  canvas: "#fcf9f8"
  surface: "#f7f2f1"
  surface-sunken: "#eee8e6"
  line: "#e2dddb"
typography:
  display:
    fontFamily: '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif'
    fontSize: "46cqw"
    fontWeight: 500
    lineHeight: 0.92
    letterSpacing: "-0.02em"
  headline:
    fontFamily: '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif'
    fontSize: "clamp(1.5rem, 3.6vh, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "normal"
  title:
    fontFamily: '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif'
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif'
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif'
    fontSize: "0.8125rem"
    fontWeight: 500
    letterSpacing: "0.08em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "14px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.muji-red}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "{colors.muji-red-deep}"
    textColor: "{colors.canvas}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  keypad-key:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  chip-ready:
    backgroundColor: "{colors.muji-red-tint}"
    textColor: "{colors.muji-red}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
---

# Design System: MUJI Queue

## 1. Overview

**Creative North Star: "The Calm Platform Board"**

A queue board for a Muji coffeeshop, read across the room and operated at the counter. It borrows the composure of a Japanese train platform display and the restraint of Muji's own in-store signage: a paper-white field, one red, generous air, and numbers large enough to find from the door. The number is the product. Everything else (logo, labels, clock, the marketing strip) recedes so a customer's eye lands on three digits and nothing competes.

The whole system runs on a single neutral field with Muji's signature red carrying the one meaningful distinction: ink numbers are still being made, red numbers are ready to collect. Red is never decoration here; where it appears, it means "act." This is a Restrained product palette that lets the READY column tip into Committed because that column is the call to action.

It explicitly rejects the fast-food queue board (loud red-and-yellow, harsh density), the generic SaaS dashboard (cards, charts, sidebars, chrome), and the cheap clip-art register (gradients, scattered shadows, stock icons, toy shapes).

**Key Characteristics:**
- One typeface (Helvetica family), weight and scale doing all the hierarchy work.
- One accent (Muji red), reserved for the READY state and primary actions.
- Tonal layering, not shadow, for depth; shadow appears only on transient overlays.
- Distance-legible numbers that scale to fit their column without ever colliding.
- Quiet, purposeful motion: a number's move from PREPARING to READY is the only choreographed moment.

## 2. Colors

A paper-white field tinted a hair toward the brand's own red (not toward generic warmth), one committed red, and a short warm-neutral ink ramp.

### Primary
- **Muji Red** (#a3212f / `oklch(47% 0.165 21)`): The single accent, close to Pantone 187C. Carries READY numbers, the logo plate, primary buttons, focus rings. ~6.3:1 on canvas, so it is legible as text, not just decoration.
- **Muji Red Deep** (#8b0f20 / `oklch(41% 0.155 22)`): Hover/active state for red surfaces and the deeper tone on the READY column heading.
- **Muji Red Tint** (#ffe8e6 / `oklch(95% 0.028 21)`): The faint wash behind the READY column and ready chips, just enough to set the act-now zone apart from the canvas.

### Neutral
- **Ink** (#272322 / `oklch(26% 0.006 40)`): Primary text and every PREPARING number. ~13:1 on canvas.
- **Ink Soft** (#615956 / `oklch(47% 0.012 40)`): Secondary labels, counts, hints. ~6.3:1 on canvas; passes AA for body.
- **Ink Faint** (#8d8481 / `oklch(62% 0.012 40)`): Empty-state and placeholder text only; large or non-essential, never body copy.
- **Canvas** (#fcf9f8 / `oklch(98.5% 0.0035 40)`): The room. Every screen's base. A true near-white with a trace of red chroma, not a warm cream.
- **Surface** (#f7f2f1 / `oklch(96.5% 0.005 40)`): Raised panels, keypad keys, chips, the promo strip.
- **Surface Sunken** (#eee8e6 / `oklch(93.5% 0.007 40)`): Entry wells and the filled digit slots.
- **Line** (#e2dddb / `oklch(90% 0.006 40)`): Hairline dividers and borders, always 1px.

### Named Rules
**The One Red Rule.** Red means "ready" or "do this." It is the READY numbers, the submit button, the focus ring, the logo. It never appears as a stripe, a fill behind a heading for flavour, or a decorative flourish. If red shows up and doesn't mean act, delete it.

**The Brand-Hue Tint Rule.** Neutrals carry a trace of red chroma (~0.004–0.007), never a warm yellow tint. The warmth of the brand lives in the red and the type, not in a cream background.

## 3. Typography

**Display / Body / Label Font:** Helvetica Neue (with Helvetica, Arial, system-ui fallbacks)

**Character:** One neutral grotesque, the typeface of Muji's own signage, in two weights. No pairing, no display face. Tabular figures everywhere a number appears so digits never jitter as the board updates. Hierarchy comes entirely from scale and the 400/500/600 weight steps.

### Hierarchy
- **Display** (500, `46cqw` of its cell, line-height 0.92): The queue numbers. Sized as a share of the grid track so 3 digits always fit with air; the track widens as a column empties, so fewer orders read bigger.
- **Headline** (600, `clamp(1.5rem, 3.6vh, 2.25rem)`): The scan-mode lead ("Scan a receipt barcode") and large prompts.
- **Title** (600, 1.5rem): Column headers (PREPARING / READY TO PICK UP), screen-level headings.
- **Body** (400, 1rem, line-height 1.5): Hints and supporting copy. Capped at ~34ch for prompts.
- **Label** (500, 0.8125rem, letter-spacing 0.08em, uppercase): Side-panel section headers, the role/status chips. Short labels only, never sentences.

### Named Rules
**The Tabular Rule.** Every digit on every screen uses `font-variant-numeric: tabular-nums`. A queue board where the numbers twitch as they change looks broken, however small the shift.

## 4. Elevation

Flat by default. Depth is built from the tonal ramp (canvas → surface → surface-sunken) and 1px hairlines, the way Muji's shelving reads as planes of paper and wood, not stacked cards. There are no resting shadows.

### Shadow Vocabulary
- **Ambient overlay** (`box-shadow: 0 2px 8px oklch(26% 0.006 40 / 0.06), 0 8px 24px oklch(26% 0.006 40 / 0.08)`): The one shadow in the system. Used only on transient, floating UI: the confirmation/error flash and the offline notice. It lifts a momentary message off the page; it is never applied to a resting element.

### Named Rules
**The Flat-Paper Rule.** Surfaces are flat at rest. If an element isn't a transient overlay, it earns separation from a tonal step or a hairline, never a shadow. If it looks like a 2014 card, the shadow is wrong.

## 5. Components

### Buttons
- **Shape:** Gently squared (8px radius).
- **Primary** (submit / "Mark ready"): Muji red fill, canvas text, 12px/24px padding. The keypad submit reuses this. Disabled state drops to surface-sunken with faint text.
- **Hover / Focus:** Background shifts to Muji Red Deep; focus shows the 2px red ring at 2px offset.
- **Secondary** ("Undo last"): Surface fill, ink text, 1px line border. Hover steps to surface-sunken. Disabled greys to faint text.

### Keypad
- **Style:** A 3-column grid of large keys (min height `clamp(3.5rem, 9vh, 5.5rem)`), surface fill, 1px line, tabular digits. Built for thumbs and distraction.
- **State:** `:active` scales to 0.97 and deepens to surface-sunken for tactile press feedback. The submit key is the primary red button; the delete key is a muted glyph.

### Chips (live queue list)
- **Style:** Compact pills, min-width 3.2rem, surface fill, 1px line, tabular number.
- **Ready variant:** Muji Red Tint wash, Muji Red number, red-tinted border. Same shape as the preparing chip, distinguished by colour and the panel it sits under.

### Queue Number (signature)
- **Style:** The board's reason to exist. Each number is its own container; the digit size is `46cqw` of the cell so it scales with available width. PREPARING numbers are ink/500; READY numbers are Muji red/600 and sit on the red-tint panel.
- **Density:** The column picks a track width from its count (≤4 widest, ≤8 medium, up to ~12 tightest), so the board stays full and legible from a quiet morning to a lunch rush without ever overflowing.
- **Motion:** A number animates from PREPARING to READY as a single shared element (Motion `layoutId`), sliding across and recolouring, over ~0.5s ease-out-quint. Entrances fade-and-rise; exits (including the 90s READY auto-expire) fade out. All of it collapses to a crossfade under reduced motion.

### Navigation / Mode switch
- **Style:** The counter station's two modes (Scan to prepare / Mark ready) are a two-tab segmented control with a 2px underline. Active tab: Muji Red Deep text, red underline. Inactive: ink-soft text, line underline. No router chrome on the display; it is a single fixed view.

### Status
- **Connection:** A small dot + label. Online is a calm ink dot ("Connected"); reconnecting is a pulsing red dot ("Reconnecting…"). The display surfaces the same state as a bottom-centre pill only when offline.

## 6. Do's and Don'ts

### Do:
- **Do** keep the queue number the largest thing in the room; size everything else down until the number wins.
- **Do** carry the PREPARING/READY split on position, label, weight, and the filled-vs-hollow status dot, so it survives colour blindness, not on red alone.
- **Do** use tabular figures for every digit, everywhere.
- **Do** keep red meaning "ready" or "act": READY numbers, primary actions, focus rings, the logo. Nothing else.
- **Do** build depth from the canvas → surface → surface-sunken ramp and 1px hairlines.
- **Do** give every animation a `prefers-reduced-motion` fallback; the board must read perfectly with motion off.

### Don't:
- **Don't** build a fast-food queue board: no loud red/yellow saturation, no harsh busy number grids.
- **Don't** reach for the SaaS dashboard kit: no cards, charts, sidebars, or admin chrome on the display.
- **Don't** ship the cheap/clip-art register: no gradients, no scattered drop shadows, no stock icons, nothing toy-like.
- **Don't** over-animate: no bounce, no flash, no attention-grabbing motion; the only choreographed move is a number crossing to READY.
- **Don't** tint neutrals toward warm cream; tint a trace toward the brand red or keep them near-neutral.
- **Don't** use a colored side-stripe border, gradient text, or a resting shadow on any element.
