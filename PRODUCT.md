# Product

## Register

product

## Users

Coffeeshop staff and customers in a Muji cafe, split across three physical surfaces:

- **Counter staff** at the `/staff` station — scanning receipt barcodes to start orders and keying in numbers to mark them served. Hands busy, eyes flicking between the machine, the cup, and the screen. Speed and a forgiving touch target matter more than chrome.
- **Table-service staff** at the `/table` station — working a tap-to-serve board, holding remainders, returning mistakes, exporting the day's log. More deliberate than the counter, but still in-task.
- **Customers** reading the `/` wall display from across the room — glancing up to see whether their queue number (last 4 digits of their receipt) has moved to "Now Serving." They read at distance, in passing, often while holding a tray.

The job to be done: move an order from *preparing* to *served* to *collected* with zero ambiguity about whose turn it is, and let a customer confirm "that's me" from across the room without asking anyone.

## Product Purpose

muji-qms is the queue runner for a single Muji coffeeshop. One shared live queue (websocket-backed) drives three views: two operator stations that mutate the queue and one public board that only displays it. Success is operational, not decorative: orders never get lost or double-called, the barista never hunts for a control, and a customer never has to ask "has mine been called?" The system earns its place by disappearing into the rhythm of a busy counter.

## Brand Personality

Calm, minimal, quiet — Muji's house restraint applied to operations software. The voice is plain and direct: "Scan a receipt barcode," "Tap an order to serve it," "now serving." No exclamation, no cheerleading, no jargon. Lowercase status confirmations ("now preparing," "picked up") read like a quiet acknowledgement, not an alert. One red accent (the Muji red) carries all the urgency the screens need; everything else is ink on near-white. Generous space, a single typeface, oversized tabular numbers as the hero element. The interface should feel like it was designed by people who trust the user to be competent.

## Anti-references

- **Loud fast-food menu boards.** No high-saturation color fields, no animated-everything QSR signage, no airport-gate flashing. Urgency is carried by one accent and by scale, not by brightness.
- **Generic SaaS dashboard.** No cards-everywhere admin-panel reflex, no decorative blue, no widgets that ignore that this lives on a wall and a counter in a physical room. Components answer to the floor, not to a design-system showcase.
- **Playful / gamified.** No mascots, badges, bouncy/elastic motion, emoji, or rounded-cartoon styling. This is a working counter.

## Design Principles

1. **Read before thought.** The wall board must resolve at a glance from across the room; the staff stations must surface the next action without a hunt. Hierarchy is set by scale and position, not by ornament.
2. **One accent does the work.** Muji red marks the live, the actionable, and the "now serving" — nothing decorative ever borrows it. Restraint everywhere else makes the accent legible.
3. **Numbers are the interface.** The queue number is the hero on every surface. Tabular figures, generous size, no competing visual weight.
4. **Quiet confirmation over alarm.** State changes acknowledge softly (a short chime, a brief flash, lowercase copy). The system reassures; it does not shout.
5. **Forgiving under speed.** Operators work fast with busy hands: large touch targets, an always-available undo, explicit confirmation only where a mistake is costly (serve, clear). Errors are recoverable, not punitive.

## Accessibility & Inclusion

- **Wall display (`/`): target WCAG AAA contrast and large type.** It is read at distance under variable cafe lighting; legibility across the room is the whole job. Push contrast and number scale past AA where the layout allows.
- **Staff stations (`/staff`, `/table`): WCAG AA minimum** for all text, controls, and state indicators, with AA-or-better focus rings (already tokenized via `--focus-ring`).
- **Reduced motion is honored globally** through `MotionConfig reducedMotion="user"`; every entrance/transition needs a still or crossfade fallback.
- **Touch targets** on operator surfaces stay comfortably large for fast, glance-free taps with busy hands.
- **State is never color-only.** Status is reinforced by position, label, and shape (chip variants, section grouping), so red/non-red is not the sole signal.
