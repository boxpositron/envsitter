# EnvSitter site design system

Source of truth for `site/`. Every color, size, radius, shadow, and motion value in `assets/styles.css` maps to a token here. Add the token here first, then use it. This file is excluded from the published Pages artifact.

## 0. Research Log

- Embedded references: shortlisted `vercel`, `linear.app`, `supabase` (developer tooling, monochrome, precise). Picked `vercel` as Layer B for its achromatic palette, shadow-as-border elevation stack, compressed display tracking, and mono technical labels, which suit a CLI security library. Layer A: `minimalist-skill` for macro whitespace, plain copy, and no gradient or emoji slop.
- Lazyweb real-product screens: skipped. The site is a two-page static docs landing whose content is fixed by the READMEs; no product-screen grammar was needed.
- StyleGallery spatial patterns: skipped. Both pages are scroll-the-document pages with no app shell; the document owns the scroll.
- Imagen concept drafts: skipped. The focal object is a typographic artifact (redacted env file plus terminal), rendered in HTML/CSS so it stays exact, accessible, and theme-aware.

## 1. Direction

A redacted dossier for developer infrastructure. The canvas is engineering white (deep graphite in dark mode), and the only "imagery" is the act of redaction: secret values appear as solid redaction bars while keys stay legible in mono. The memorable moment is the hero, where values are redacted in front of the visitor and a terminal beside them answers with keys and booleans only. Color is functional: green for a match or an allowed action, red for a blocked one, blue for fingerprints and focus.

## 2. Color tokens

All theme tokens use `light-dark()` with `color-scheme: light dark`, so one declaration serves both themes and the OS preference decides.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `#ffffff` | `#0a0a0a` | Page canvas |
| `--bg-subtle` | `#fafafa` | `#0f0f0f` | Alternate section band |
| `--surface` | `#ffffff` | `#141414` | Cards, panels |
| `--surface-2` | `#f5f5f5` | `#1c1c1c` | Inline code, chips, table header |
| `--text` | `#171717` | `#ededed` | Headings, primary text |
| `--text-2` | `#4d4d4d` | `#a3a3a3` | Body copy |
| `--text-3` | `#666666` | `#8f8f8f` | Captions, metadata (AA on both canvases) |
| `--ring` | `rgb(0 0 0 / 0.08)` | `rgb(255 255 255 / 0.10)` | Shadow-as-border |
| `--ring-strong` | `rgb(0 0 0 / 0.14)` | `rgb(255 255 255 / 0.18)` | Hover border, dividers |
| `--inner` | `#fafafa` | `rgb(255 255 255 / 0.03)` | Inner highlight ring in the card stack |
| `--redact` | `#171717` | `#e5e5e5` | Redaction bar ink |
| `--ok` | `#0f7b3d` | `#3fcf7f` | Match true, allowed |
| `--block` | `#c4291c` | `#ff7a6e` | Blocked, refused |
| `--hash` | `#0068d6` | `#5aa9ff` | Fingerprints, links |
| `--focus` | `hsl(212 100% 48%)` | same | Focus ring |

Terminal palette (dark in both themes, so the terminal reads as a real console): `--term-bg #0b0b0c`, `--term-bar #151517`, `--term-text #e6e6e6`, `--term-muted #8f8f94`, `--term-ok #3fcf7f`, `--term-block #ff7a6e`, `--term-hash #5aa9ff`, `--term-key #f2c46d` (keys in JSON output).

Atmosphere: hero dot grid `--dot` (`rgb(0 0 0 / 0.07)` / `rgb(255 255 255 / 0.06)`) masked to fade out, plus one radial glow `--glow` (`rgb(0 104 214 / 0.07)` / `rgb(90 169 255 / 0.08)`) behind the hero visual.

## 3. Typography

- `--font-sans`: `"Geist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif` (self-hosted variable woff2, OFL)
- `--font-mono`: `"Geist Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace` (self-hosted variable woff2, OFL)
- Ligatures on (`font-feature-settings: "liga"`); weights 400 read, 500 interact, 600 announce. No 700.

| Role | Size | Weight | Line height | Tracking |
|---|---|---|---|---|
| Display (h1) | `clamp(2.5rem, 4.2vw + 1rem, 4rem)` | 600 | 1.02 | `-0.045em` |
| Section (h2) | `clamp(1.75rem, 2vw + 1rem, 2.5rem)` | 600 | 1.1 | `-0.04em` |
| Card title (h3) | `1.25rem` | 600 | 1.3 | `-0.02em` |
| Lede | `clamp(1.0625rem, 0.4vw + 1rem, 1.25rem)` | 400 | 1.7 | normal |
| Body | `1rem` | 400 | 1.65 | normal |
| Small | `0.875rem` | 400/500 | 1.55 | normal |
| Eyebrow / label | `0.75rem` mono, uppercase | 500 | 1.3 | `0.08em` |
| Code | `0.8125rem` to `0.875rem` mono | 400 | 1.7 | normal |

## 4. Space, radius, elevation

- Spacing (4px base): `--s-1 4px`, `--s-2 8px`, `--s-3 12px`, `--s-4 16px`, `--s-5 24px`, `--s-6 32px`, `--s-7 48px`, `--s-8 64px`, `--s-9 96px`, `--s-10 128px`. Section padding `--section-y: clamp(64px, 9vw, 128px)`.
- Container: `--container: 1120px`, gutters `clamp(20px, 4vw, 32px)`.
- Radius: `--r-xs 4px` (inline code), `--r-sm 6px` (buttons), `--r-md 8px` (cards), `--r-lg 12px` (panels), `--r-pill 9999px` (badges only).
- Elevation (vercel shadow-as-border stack, never a CSS border on cards):
  - `--e-1`: `0 0 0 1px var(--ring)`
  - `--e-2`: `0 0 0 1px var(--ring), 0 2px 2px rgb(0 0 0 / 0.04)`
  - `--e-3`: `0 0 0 1px var(--ring), 0 2px 2px rgb(0 0 0 / 0.04), 0 12px 24px -12px rgb(0 0 0 / 0.12), inset 0 0 0 1px var(--inner)`
  - `--e-term`: `0 0 0 1px rgb(255 255 255 / 0.06), 0 24px 48px -24px rgb(0 0 0 / 0.45), 0 2px 6px rgb(0 0 0 / 0.10)`

## 5. Primitives and states

| Primitive | Anatomy | States |
|---|---|---|
| `.btn-primary` | `--text` fill, `--bg` text, `--r-sm`, 40px min height | hover: 85% fill; active: `scale(0.98)`; focus-visible: 2px `--focus` outline, 2px offset |
| `.btn-secondary` | `--surface` fill, `--e-1` ring | hover: `--ring-strong` ring; active, focus as above |
| `.copy-cmd` | mono command in a `--surface` box with `--e-2`, copy button on the right | button hidden until JS confirms clipboard support; copied: check glyph plus "Copied" announced through an `aria-live` region |
| `.card` | `--surface`, `--e-2`, `--r-md`, 24px to 32px padding | static (no hover lift: cards are not interactive) |
| `.card-link` | `.card` that is a link | hover: `--e-3`; focus-visible ring |
| `.badge` | pill, `--surface-2`, mono 12px uppercase | static |
| `.op` chip | mono op name plus one-line description | static |
| `.terminal` | window bar with three dots and a title, mono body lines `.ln-cmd`, `.ln-out`, `.ln-ok`, `.ln-block`, `.ln-muted` | static; horizontal scroll on narrow screens with a visible focusable region |
| `.envfile` | panel with key column and `.redact` bars | bars animate in once on load (see motion) |
| `.data-table` | hairline rows, `--surface-2` header | static |
| `.site-header` | sticky, translucent `--bg` with blur, hairline bottom | nav links: hover `--text`, current page `aria-current` |
| `.section-head` | eyebrow label plus h2 plus lede | static |

No coloured edge stripes anywhere: state is shown with tone (`--surface-2`), ink color, or glyphs.

## 6. Motion

- Redaction reveal (signature): `.redact` bars `transform: scaleX(0 -> 1)` from the left, 520ms `cubic-bezier(0.16, 1, 0.3, 1)`, staggered 90ms per row, after a 250ms delay. It demonstrates the product idea (values become bars) and runs once.
- Buttons: `transform` and `background-color` 150ms ease; `scale(0.98)` on active.
- Copy confirmation: glyph swap with `opacity` 150ms.
- `prefers-reduced-motion: reduce`: no transitions or animations; bars render in their final state.
- Only `transform` and `opacity` animate. No scroll-triggered reveals.

## 7. Responsive

- Breakpoints: `640px` (nav collapses to essentials, single column), `960px` (hero switches from stacked to two columns, grids to 2 or 3 columns).
- Hero visual stacks below the copy under 960px. Terminal and code blocks scroll horizontally inside their own focusable region instead of overflowing the page.
- Tap targets at least 40px; body text never below 16px.

## 8. Accessibility constraints and accepted debt

- WCAG AA contrast for all text tokens in both themes (verified pairs listed in section 2); terminal colors checked against `--term-bg`.
- Semantic landmarks (`header`, `nav`, `main`, `footer`), one `h1` per page, skip link, `aria-current="page"` on the active nav item.
- Redaction bars are decorative: each value cell has `aria-label="value hidden"` text for assistive tech.
- Every page works without JavaScript; JS only adds copy buttons.
- Accepted debt: no manual theme toggle (the OS preference decides); no search; content is duplicated from the READMEs and must be updated by hand when the tool surface changes.
- Accepted debt: Lighthouse mobile performance is 99 (simulated slow 4G with gzip: FCP 1.2s, LCP 1.8s, TBT 0, CLS 0); desktop is 100, and accessibility, best practices, and SEO are 100 on both. The last point needs the stylesheet inlined at deploy time, deferred to keep the site build-free. Dropping the Geist preload was measured and made FCP worse (1.7s), so the preload stays.
