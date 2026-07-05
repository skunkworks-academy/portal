# Skunkworks Academy Portal Navigation Standard

This repository now treats `src/styles.css` as the single source of truth for the portal shell theme, formatting, layout and fallback top-menu navigation.

## Canonical top-menu pattern

The portal fallback navigation uses:

```tsx
<header className="top" data-fallback-header="true">
  <div className="shell nav">
    <Brand eyebrow="Portal" />
    <nav className="links" aria-label="Primary portal navigation">...</nav>
  </div>
</header>
```

The menu is intentionally aligned to `portal.skunkworksacademy.com`:

- Sticky glass header with `76px` desktop rhythm.
- Skunkworks logo pair for light and dark schemes.
- Pill-style global navigation links.
- Gradient Microsoft sign-in call-to-action.
- Accessible menu toggle injected by `src/global-nav-toggle.ts`.
- Responsive flyout grid on tablet and mobile.
- `body.swa-has-global-nav` compatibility so a centrally injected Academy nav can suppress the fallback header.

## Styling rule

Do not reintroduce parallel theme files such as:

- `site-theme.css`
- `mobile-optimisation.css`
- `global-nav-compat.css`
- `responsive-contrast.css`

All shared tokens, responsive breakpoints, contrast rules, focus states and component layout rules belong in `src/styles.css`.

## Audit result

The previous styling model split navigation and theme behaviour across multiple files with overlapping `!important` overrides. The consolidated model removes that cascade conflict and makes the portal easier to maintain, test and copy into other Skunkworks Academy ecosystem sites.
