---
name: muji-qms
description: Queue management for a Muji coffeeshop — ink on paper-white, one red mark, numbers as the interface.
colors:
  muji-red: "oklch(50% 0.19 21)"
  muji-red-deep: "oklch(43% 0.175 22)"
  muji-red-tint: "oklch(95% 0.033 21)"
  ink: "oklch(26% 0.006 40)"
  ink-soft: "oklch(47% 0.012 40)"
  ink-faint: "oklch(62% 0.012 40)"
  canvas: "oklch(98.5% 0.0035 40)"
  surface: "oklch(96.5% 0.005 40)"
  surface-sunken: "oklch(93.5% 0.007 40)"
  line: "oklch(90% 0.006 40)"
typography:
  display:
    fontFamily: "Helvetica, 'Helvetica Neue', Arial, system-ui, sans-serif"
    fontSize: "34cqw"
    fontWeight: 500
    lineHeight: 0.92
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Helvetica, 'Helvetica Neue', Arial, system-ui, sans-serif"
    fontSize: "clamp(1.8rem, 3.6vw, 4.25rem)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0"
  title:
    fontFamily: "Helvetica, 'Helvetica Neue', Arial, system-ui, sans-serif"
    fontSize: "clamp(1.4rem, 2.6vw, 3rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "0.02em"
  body:
    fontFamily: "Helvetica, 'Helvetica Neue', Arial, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Helvetica, 'Helvetica Neue', Arial, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "14px"
  pill: "999px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
  "16": "64px"
  "24": "96px"
components:
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  chip-ready:
    backgroundColor: "{colors.muji-red-tint}"
    textColor: "{colors.muji-red}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  chip-hold:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  button-undo:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  mode-tab:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-soft}"
    padding: "12px"
---

# Design System: muji-qms

## 1. Overview

**Creative North Star: "The Quiet Counter"**

muji-qms treats running a queue as a calm ritual, not a control panel. Ink sits on paper-white, a single red mark carries every bit of urgency the room needs, and an oversized queue number is the one thing the eye lands on. The interface recedes so the order is all you see: a barista glances and acts, a customer across the room glances and knows. This is Muji-house restraint applied to a working counter, software that trusts the user to be competent and refuses to shout for attention.

Density flexes by surface but the voice never does. The wall display (`/`) is read at distance and goes airy and huge; the staff stations (`/staff`, `/table`) pack a live queue into a side panel without ever feeling like an admin dashboard. Across all three, hierarchy is set by **scale and position**, never by ornament. There is one typeface (Helvetica), one accent (Muji Red), and a tight neutral ramp warmed a hair toward hue 40. Everything else is space.

This system explicitly rejects three things. It is **not a loud fast-food menu board**: no high-saturation color fields, no flashing, no airport-gate animation. It is **not a generic SaaS dashboard**: no cards-everywhere reflex, no decorative blue, no widgets that forget this lives on a wall and a counter in a physical room. And it is **not playful or gamified**: no mascots, badges, bouncy motion, emoji, or rounded-cartoon styling. This is a counter, and it behaves like one.

**Key Characteristics:**
- Numbers are the interface — tabular figures, generous size, hero weight.
- One accent (Muji Red) does all the work; everything else is ink on paper-white.
- Hierarchy through scale and position, not decoration.
- Quiet confirmation over alarm: a short chime, a brief flash, lowercase copy.
- Forgiving under speed: large targets, always-available undo, confirm only where a mistake is costly.

## 2. Colors

A near-monochrome neutral field warmed a hair toward hue 40, pierced by a single saturated red. The restraint everywhere else is what makes the red legible.

### Primary
- **Muji Red** (`oklch(50% 0.19 21)`): The one and only accent — the definitive, full-saturation Muji red, held firmly on the red side of its hue so it never drifts pink or coral. Marks the live, the actionable, and the "now serving": ready-state numbers on the wall board, the active mode-tab underline, the connection-trouble pulse, the serve/collect checks. Nothing decorative is ever allowed to borrow it. On wide-gamut screens (the wall-display TV, modern tablets) it expands into Display-P3 (`oklch(50% 0.25 21)`) so the mark reads as vivid as the panel allows; sRGB stations stay AA-safe because the *lightness* is held steady and only chroma grows.
- **Muji Red Deep** (`oklch(43% 0.175 22)`): The pressed/emphasis shade. Used for active-tab text and the "Now Serving" column title where the brighter red would vibrate against large type. Also the canonical focus-ring color. P3-enhanced to `oklch(44% 0.21 22)` on wide-gamut displays.
- **Muji Red Tint** (`oklch(95% 0.033 21)`): The faintest red wash. Backs the "Now Serving" column and ready chips so served orders read as a warm zone, not just red text on white.

### Neutral
- **Ink** (`oklch(26% 0.006 40)`): Primary text and the PREPARING queue numbers. Near-black, faintly warm.
- **Ink Soft** (`oklch(47% 0.012 40)`): All secondary text — labels, hints, the clock date, inactive tab text, counts, and empty-state copy. ~6.3:1 on Canvas, clears AA. The floor for anything a user actually reads.
- **Ink Faint** (`oklch(62% 0.012 40)`): Non-text marks and inactive controls only — the resting connection dot and disabled button text. ~3.3:1 on Canvas, below AA; never used for load-bearing text.
- **Canvas** (`oklch(98.5% 0.0035 40)`): The paper-white body background. The default field everything sits on.
- **Surface** (`oklch(96.5% 0.005 40)`): One step down — chips, the undo button, the promo footer, panels.
- **Surface Sunken** (`oklch(93.5% 0.007 40)`): The pressed/hover layer for surface elements.
- **Line** (`oklch(90% 0.006 40)`): Every border and divider. Hairline only.

### Named Rules
**The One Mark Rule.** Muji Red appears on no more than a small fraction of any screen, and only ever to mean *live / actionable / now serving*. Its rarity is the entire point: the moment red becomes decorative, the board stops being readable across the room.

**The Warm-Neutral Rule.** Every neutral carries a trace of hue 40 (chroma 0.0035–0.012). Pure-gray (`#ccc`, `chroma 0`) neutrals are forbidden; they read cold and clinical against the red and break the paper-white feel.

**The Legible-Faint Rule.** Ink Faint is for non-text marks (the connection dot) and disabled controls only. Any text a user is meant to read — including a count or an empty-state message — is Ink Soft or darker. Light gray "for elegance" is forbidden; it fails AA and is the fastest way to make the board unreadable across the room.

**The Wide-Gamut Mark Rule.** Brightness comes from lightness; emphasis comes from chroma. To make the red stronger on a good screen, raise chroma into Display-P3 under `@media (color-gamut: p3)` and hold lightness fixed — never crank lightness, which would brighten the red by *desaturating* it and quietly break white-on-red button contrast. The wall-display TV earns the vivid red; the sRGB stations get the gamut-mapped equivalent for free.

## 3. Typography

**Display Font:** Helvetica (with `'Helvetica Neue', Arial, system-ui, sans-serif`)
**Body Font:** Helvetica (same stack — one family does everything)
**Numeric:** Helvetica with `font-variant-numeric: tabular-nums` and `letter-spacing: -0.02em` (the `.tnum` treatment)

**Character:** One neutral grotesque carries headings, labels, body, and the hero numbers. No pairing, no display face. Personality comes from weight contrast and the sheer scale of the numbers, not from a second typeface. Helvetica's plainness is the point: it is the typographic equivalent of "the interface recedes."

### Hierarchy
- **Display** (500, `34cqw` container-scaled, line-height 0.92): The queue number itself, sized to its tile via container queries so it scales with the board's density. Tabular figures, tight tracking. This is the hero on every surface.
- **Headline** (700, `clamp(1.8rem, 3.6vw, 4.25rem)`, up to 6.5rem on signage): The "Now Serving" column title only. The one heading allowed to go big and bold, in Muji Red Deep.
- **Title** (600, `clamp(1.4rem, 2.6vw, 3rem)`): Standard section/column titles ("Preparing"), in Ink.
- **Body** (400, `1rem`, line-height 1.5): Hints, notes, dialog copy. Capped at ~34ch for centered hint blocks; 65–75ch if prose ever runs longer.
- **Label** (500, `0.8125rem`, letter-spacing 0.08–0.16em, UPPERCASE): Eyebrow labels — station role, queue-group titles, the column note. Short only (≤4 words); never a sentence.

### Named Rules
**The Tabular Number Rule.** Every queue number, count, and clock uses `font-variant-numeric: tabular-nums` with `-0.02em` tracking. Numbers must not reflow or jitter as digits change; a clock that shifts width on every tick is a defect.

**The Single-Family Rule.** One typeface, full stop. Hierarchy is built from weight (400/500/600/700) and scale. Introducing a second family — a display serif, a "friendly" rounded sans — is forbidden; it reads as indecision and breaks the quiet.

## 4. Elevation

Flat by default. Depth comes from **tonal layering** (canvas → surface → surface-sunken) and hairline borders, not from shadows. The only shadow in the system is a single soft ambient elevation reserved for the one element that genuinely floats above the room: the offline toast. Dialogs rely on the browser's native `::backdrop` dimming plus a border, not a drop shadow.

### Shadow Vocabulary
- **Ambient** (`box-shadow: 0 2px 8px oklch(26% 0.006 40 / 0.06), 0 8px 24px oklch(26% 0.006 40 / 0.08)`): The floating-toast lift only. Soft, warm-tinted, double-layered. Never applied to chips, tiles, or cards at rest.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest and separated by tone and 1px lines. A shadow appears only when an element is genuinely overlaying the page (the offline toast). If a chip or tile has a drop shadow, it is wrong — deepen the tone or the border instead.

## 5. Components

Refined and restrained: soft corners, hairline borders, surface tints in place of shadow, quiet hover shifts. Components feel calm and trustworthy, never tactile-loud, but stay large enough to tap fast with busy hands.

### Buttons
- **Shape:** Gently rounded (8px / `{rounded.md}` for the undo button; tools/menu items square off into the surface).
- **Undo (secondary):** Surface background, Ink text, 1px Line border, `8px 16px` padding. The canonical quiet action button.
- **Hover:** Background shifts Surface → Surface Sunken; no lift, no scale on standard buttons.
- **Disabled:** Text drops to Ink Faint, `cursor: not-allowed`. No opacity tricks.
- **Focus:** 2px Muji Red Deep outline at 2px offset (global `--focus-ring`), never removed.

### Chips
- **Default (`chip`):** Surface background, Ink text, 1px Line border, 8px radius, min-width 3.2rem so single digits don't collapse. The resting queue-number token.
- **Ready (`chip-ready`):** Muji Red text on a Muji-Red-Tint wash, border warmed toward red. Semibold. Reads as the "served" zone.
- **Hold (`chip-hold`):** Ink text, **dashed** Ink-Faint border on Surface — the one place a dashed border is correct, signalling a provisional "remainder to collect later" state.
- **Pickup (interactive variant):** Adds pointer cursor, a 0.96 active-scale press, and a hover that warms background and border toward Muji Red. The press-scale is the only "playful" motion allowed, and only because it confirms a tap.

### Tiles (signature — the serve tile)
- **Style:** Large tap target on the `/table` board carrying a queue number plus a live wait label ("4m"). Surface background, 14px (`{rounded.lg}`) corners, selectable state when its confirm dialog is open.
- **Entrance:** Springs in via Motion with `opacity + scale(0.9→1) + y(12→0)`, eased `ease-out-quint`, popLayout so siblings reflow smoothly. Exit fades and shrinks slightly.

### Mode Tabs (staff input switch)
- **Style:** Text-only tabs over a 2px bottom border. Inactive = Ink Soft text on a Line underline; active = Muji Red Deep text on a Muji Red underline, animated over 220ms.
- **Behavior:** Proper `role="tablist"` / `role="tab"` with `aria-selected`; labels collapse from full ("Scan to prepare") to short ("Prepare") at narrow widths.

### Dialogs
- **Style:** Native `<dialog>` with `showModal()`, centered, hairline border, native backdrop dimming. Used only where a mistake is costly: confirm-serve and clear-queue. Click-outside-to-close has a 400ms guard so an accidental double-tap can't dismiss it.
- **Actions:** A quiet Cancel (autofocused) paired with a committed primary action ("Serve" / "Clear all"). Verb + object labels, never "OK / Yes".

### Connection Status
- **Style:** A small dot + label. Online = solid Ink dot, steady. Offline/connecting = Muji Red dot pulsing at 1.1s. State is never color-only — the pulse animation and the label text both reinforce it.

### Navigation
There is no chrome navigation. The three routes (`/`, `/staff`, `/table`) are fixed installations, each a full-screen `100dvh` grid. The "navigation" is physical: which screen you walk up to.

## 6. Do's and Don'ts

### Do:
- **Do** make the queue number the largest, heaviest thing on every surface. Tabular figures, `-0.02em` tracking, sized by container query on the board.
- **Do** reserve Muji Red (`oklch(47% 0.165 21)`) for *live / actionable / now-serving* only, on a small fraction of the screen.
- **Do** keep neutrals warm (hue 40, chroma 0.0035–0.012). Separate surfaces by tone (canvas → surface → surface-sunken) plus 1px Line borders.
- **Do** stay flat at rest; the only shadow is the offline toast's ambient lift.
- **Do** confirm softly — a 2-note chime, a brief flash, lowercase status copy ("now serving", "picked up").
- **Do** keep tap targets large and undo always reachable; gate only costly actions (serve, clear) behind a dialog.
- **Do** honor `prefers-reduced-motion` (wired globally via `MotionConfig reducedMotion="user"`); every entrance needs a still fallback.
- **Do** push the wall board (`/`) toward AAA contrast and maximum number scale; it's read across a room.

### Don't:
- **Don't** build a loud fast-food menu board: no high-saturation color fields, no flashing, no animated-everything QSR signage.
- **Don't** build a generic SaaS dashboard: no cards-everywhere reflex, no decorative blue, no widgets that ignore the physical room.
- **Don't** go playful or gamified: no mascots, badges, emoji, bouncy/elastic motion, or rounded-cartoon styling.
- **Don't** let Muji Red drift pink or coral, and never use it decoratively. If red isn't saying "live", it's wrong.
- **Don't** introduce a second typeface or a display face. One Helvetica, weight contrast only.
- **Don't** add drop shadows to chips, tiles, or cards. Deepen the tone or the border instead.
- **Don't** use pure-gray (chroma 0) neutrals; they read cold against the red and break the paper-white feel.
- **Don't** let numbers reflow or jitter — tabular figures everywhere a count or clock changes.
- **Don't** use a colored `border-left`/`border-right` stripe as an accent; full borders or background tints only.
