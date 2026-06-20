# Alapon Design System — "Midnight Signal"

The visual identity for Alapon, a privacy-first peer-to-peer end-to-end encrypted
video meeting app. Calm, premium, trustworthy — a focused pro tool, not a noisy
SaaS dashboard.

All tokens live in `src/index.css` under `@theme` (Tailwind v4). Change a value
there and it propagates everywhere. Components reference **only** semantic tokens
(`bg-surface`, `text-muted`, `bg-accent`, `font-display`, …) — never raw Tailwind
palette classes like `gray-900` or `blue-600`.

## Principles
1. The video stage is sacred and stays near-black — video reads best on dark. The
   identity lives in the lobby, top bar, panels, controls, and type.
2. One confident accent (signal cyan). Color is used sparingly and meaningfully.
3. Calm over loud: subtle borders + faint depth, no heavy shadows, no decorative blobs.
4. Real typography. Space Grotesk for identity, Hanken Grotesk for everything else.
5. Every interactive element has a visible focus ring and an accessible label.

## Color tokens

| Token | Hex | Use |
|-------|-----|-----|
| `base` | `#0B0E14` | app background, video stage |
| `surface` | `#141925` | top bar, control bar, panels |
| `elevated` | `#1E2533` | inputs, secondary buttons, empty tiles, avatars |
| `border` | `#27303F` | hairline borders / dividers |
| `text` | `#E6E9EF` | primary text |
| `muted` | `#8A93A6` | secondary text (passes 4.5:1 on base & surface) |
| `accent` | `#22D3EE` | links, active toggles, focus rings, primary CTA |
| `accent-hover` | `#38DEF6` | hover state for accent surfaces |
| `accent-ink` | `#06141A` | text/icons ON accent/success/warn surfaces |
| `danger` | `#E5484D` | leave button, errors (works as bg w/ white icon and as text on dark) |
| `danger-hover` | `#F2555A` | hover for danger |
| `success` | `#34D399` | mic/cam "on", success toasts, connected badge |
| `warn` | `#FBBF24` | raised hand, reconnecting |

**Contrast rule:** accent/success/warn are *light* surfaces — text/icons on them
must be `accent-ink` (dark). White goes only on `danger` and `elevated`.

## Typography
- Display: **Space Grotesk** (`font-display`) — wordmark "Alapon" and screen titles.
- Body: **Hanken Grotesk** (`font-sans`, the default) — everything else.
- Loaded via Google Fonts `<link>` in `index.html` (Space Grotesk 500/600/700,
  Hanken Grotesk 400/500/600/700).

## Shape, depth, motion
- Radius: `rounded-lg` (8px) controls, `rounded-lg`/`rounded-2xl` panels, `rounded-full` round buttons.
- Depth: 1px `border-border` + faint shadow on floating surfaces (toasts, bottom sheet). No heavy drop shadows.
- Motion: `transition-colors`/opacity at ~150-180ms ease-out. Respect
  `prefers-reduced-motion` (handled globally in `src/index.css`).

## Component patterns
- **Primary CTA / active toggle:** `bg-accent text-accent-ink hover:bg-accent-hover`.
- **Secondary button:** `bg-elevated hover:bg-border text-text`.
- **Round control button:** `rounded-full p-3`; active = colored surface with `accent-ink`
  icon (red leave button keeps a white icon); inactive = `bg-elevated` with `text-text`.
- **Inputs:** `bg-elevated border border-border focus:border-accent`, visible label.
- **Panels:** `bg-surface`, `border-border`; on mobile they are bottom sheets
  (`rounded-t-2xl`, ~72vh), docked 320px on `sm+`. Always have a close (X) button.
- **Video tile:** `bg-surface`, name overlay bottom, raised-hand badge (`bg-warn`) top-left,
  active-speaker `ring-accent`. In 1:1, self pins as a small PiP (`compact`).
- **Toast:** `bg-surface` + colored border by type, icon tinted by type, auto-dismiss.

## Accessibility
- Focus: every control has `focus-visible:ring-2 focus-visible:ring-accent`.
- Labels: icon-only buttons carry `aria-label`; toggles carry `aria-pressed`.
- Touch targets: round controls are 44px+ (`p-3` on a 20px icon).
- Contrast: body/muted text ≥ 4.5:1; icons on accent/danger ≥ 3:1 (enforced via the ink rule).
- Reduced motion respected globally.

## Responsive
- Mobile-first, Google Meet-style. PreJoin stacks (`grid-cols-1 md:grid-cols-2`).
- Meeting: full-screen stage; top bar + round control bar always visible; panels as bottom sheets.
- `sm` breakpoint (640px) is the phone↔tablet/desktop switch for panels and chrome.

## Not in scope (yet)
- Light theme / theme switching (Midnight Signal is dark-only).
- Frame-level E2E media encryption UI (tracked separately).
