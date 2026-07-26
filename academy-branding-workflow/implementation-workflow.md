# Branding Implementation Workflow

Use this process before changing portal styling, formatting, or UI branding.

## 1. Scan

Inspect these files first:

```text
index.html
package.json
README.md
src/main.tsx
src/App.tsx
src/styles.css
src/site-theme.css
src/mobile-optimisation.css
src/global-nav-compat.css
src/global-nav-toggle.ts
scripts/validate-global-navigation.ts
.github/workflows/ci.yml
```

Answer these questions before editing:

1. Which files define layout and theme tokens?
2. Which file imports the CSS chain?
3. Which navigation links are mandatory?
4. Which checks run in CI?
5. Does the change affect signed-out, student, instructor, or staff views?

## 2. Map to existing patterns

| Requested work | Existing pattern |
|---|---|
| Landing or overview section | `.portal-hero`, `.hero-copy`, `.landing-actions` |
| Role entry cards | `.workspace-grid`, `.role-entry`, `.role-entry.selected` |
| Dashboard sections | `.dashboard-grid`, `.content-grid`, `.command-panel` |
| Repeated records | `.card-grid`, `.card`, `.record-list` |
| Status labels | `.pill`, `.pill.success` |
| Forms | `.form-panel`, `label`, `.full` |
| Feedback | `.alert`, `.alert.error`, `.alert.warning` |
| Navigation | `.top`, `.shell.nav`, `.brand`, `.links`, `globalNav` |

If a component cannot be mapped, add only a small extension class and document it in `component-patterns.md`.

## 3. Implement

Rules:

1. Extend CSS variables instead of hard-coding colours repeatedly.
2. Preserve the stylesheet import order in `src/main.tsx`.
3. Keep app layout in `src/styles.css`.
4. Keep cross-site overrides in `src/site-theme.css`.
5. Keep mobile behaviour in `src/mobile-optimisation.css`.
6. Keep global navigation compatibility in `src/global-nav-compat.css`.
7. Avoid new dependencies for simple layout, cards, buttons, or gradients.

## 4. Validate

Run these from the repository root when dependencies are available:

```bash
node academy-branding-workflow/validation/check-branding.mjs
npm test
npm run validate:global-nav
npm run build
npm run build:api
npm run teams:icons
npm run teams:validate
```

## 5. Visual QA

Check these areas:

- Signed-out landing page.
- Student workspace.
- Instructor workspace.
- Staff workspace.
- Microsoft sign-in button and signed-in user chip.
- Course cards.
- Class registration cards.
- Instructor application form.
- Profile form.
- Staff operations forms.

Check these breakpoints:

```text
1440px
1180px
980px
860px
680px
560px
390px
```

Check these user preferences:

```text
prefers-color-scheme: dark
prefers-color-scheme: light
prefers-reduced-motion: reduce
```

## 6. Pull request checklist

```md
## What changed
- 

## Why
- 

## Brand impact
- 

## Validation
- [ ] node academy-branding-workflow/validation/check-branding.mjs
- [ ] npm test
- [ ] npm run validate:global-nav
- [ ] npm run build
- [ ] npm run build:api
- [ ] npm run teams:icons
- [ ] npm run teams:validate

## Visual QA
- [ ] Desktop
- [ ] Tablet
- [ ] Mobile
- [ ] Dark mode
- [ ] Light mode
```

## Decision rule

When a generated screen looks good but does not follow the portal system, reject it. The portal must remain one coherent Skunkworks Academy product.
