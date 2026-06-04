# Product

## Register

product

## Users

Three audiences across three screens, no logins, no accounts:

- **Counter staff** on a handheld Zebra Android barcode scanner. Scan the barcode on an ETP receipt; the last 3 digits become the order number. One confirm action marks it *preparing*. Working fast, between other tasks, one-handed, on a small rugged screen.
- **Kitchen staff** on a fixed screen. When an order is done, key in its 3-digit number to move it from *preparing* to *serve*. Hands busy, glancing up, needs a fat numeric keypad and an unmissable confirmation.
- **Customers** reading the display monitor from across the shop. They scan the *serve* column for their number, then walk to the counter. Passive, at distance, no interaction.

## Product Purpose

A standalone Queue Management System for a Muji coffeeshop. It decouples order tracking from the ETP point-of-sale: receipts already print a number, this system shows where each number is in the line. Three surfaces:

1. **Display monitor** (hero, customer-facing): Muji wordmark, a two-column **PREPARING | SERVE** board of 3-digit numbers, and a tertiary marketing/campaign area.
2. **Scanner** (staff): barcode scan → confirm → *preparing*.
3. **Kitchen entry** (staff): numeric keypad → *serve*.

No database, no backend. State lives in `localStorage`; realtime sync between the three screens uses the **BroadcastChannel API** (localStorage as fallback / refresh persistence). Local-only demo, not a production deployment. Success = a customer can tell at a glance whether their order is still cooking or ready to collect, and staff can move a number between states in under two seconds.

## Brand Personality

Calm, precise, quietly confident. Muji's no-brand minimalism: nothing decorative, nothing shouting, every element earning its place. Three words: **restrained, legible, trustworthy.** It should feel like part of the Muji store, not a piece of software bolted on. Uses Muji's signature red as the single accent; typography and layout are our own, chosen for legibility at distance.

## Anti-references

- **Fast-food queue boards.** No loud red/yellow saturation, no harsh busy McDonald's-style number grids.
- **Generic SaaS dashboard.** No cards, charts, sidebars, or admin-panel chrome.
- **Cheap / clip-art look.** No gradients, no scattered drop shadows, no stock icons, nothing toy-like.
- **Over-animation.** No bounce, no flash, no attention-grabbing motion. Transitions are quiet and purposeful.

## Design Principles

- **The number is the product.** On the display, the 3-digit order numbers are the largest, clearest thing in the room, readable from 5+ meters. Everything else recedes.
- **Preparing vs serve must be unmistakable.** The two states are distinguished by position, weight, and a redundant non-color cue (not color alone), so the split reads instantly and survives color blindness.
- **One action per moment.** Staff screens do exactly one thing each: scan-and-confirm, or key-and-confirm. No menus, no modes, no ambiguity.
- **Quiet motion as feedback.** Animation exists only to confirm state change (a number moving from PREPARING to SERVE), never for decoration. Calm, ease-out, brief.
- **Trust through restraint.** Whitespace, alignment, and consistency do the work that color and ornament do in lesser interfaces.

## Accessibility & Inclusion

- WCAG AA minimum across all three screens.
- **Display monitor:** large-format legibility is the dominant constraint. Number contrast well above 4.5:1; the preparing/serve distinction carries a non-color cue (label, position, weight) so it never depends on red alone. Color-blind safe.
- **Staff screens:** large touch targets (handheld scanner is small and used one-handed; kitchen keypad used while distracted). Clear focus states, generous hit areas, unambiguous confirmation.
- **Reduced motion:** every transition has a `prefers-reduced-motion` alternative (instant or crossfade). The board must remain fully readable with motion off.
