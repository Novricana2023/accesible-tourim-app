# Inclusive Tourism design tokens

Light, professional accessibility-product theme. Components must use Tailwind semantic classes mapped in `apps/web/src/index.css` (`@theme`), not one-off hex values.

## Surfaces

| Token | Role |
|-------|------|
| `bg` | Page background (`#f4f6f9`) |
| `bg-subtle` | Hero bands, section tint |
| `surface` | Cards, panels (`#ffffff`) |
| `surface-inset` | Nested wells, camera chrome |
| `border` | Default dividers |

## Text

| Token | Role |
|-------|------|
| `fg` | Primary text (slate 900) |
| `fg-muted` | Secondary copy |
| `fg-subtle` | Hints, metadata |

## Semantic actions

| Token | Use |
|-------|-----|
| `primary` / `primary-fg` / `primary-hover` | Main calls to action |
| `accent` / `accent-muted` | Links, focus ring, secondary emphasis |
| `success` / `success-bg` | Ready, live, OK |
| `warning` / `warning-bg` | Paused, experimental, checking |
| `danger` / `danger-fg` | Stop, errors |
| `active` / `active-bg` | Current mode highlight |

## Accessibility

- Body text on `surface`: `#0f172a` on `#ffffff` — exceeds WCAG AA.
- Primary button: `#ffffff` on `#0c5c6e` — exceeds WCAG AA.
- Focus: 3px `#2563eb` outline (`focus-visible`).
- Minimum interactive target: 48px (`min-h-12` on controls).
- Typeface: Atkinson Hyperlegible.

## Motion

Respect `prefers-reduced-motion` (global CSS in `index.css`).

## Icons

Lucide React, 24px default, `strokeWidth={1.75}` for mode cards; decorative icons marked `aria-hidden`.
