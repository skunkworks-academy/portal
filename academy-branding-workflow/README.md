# Skunkworks Academy Portal Branding Workflow

This folder is the single root-level operating pack for keeping the `skunkworks-academy/portal` repository visually aligned with Skunkworks Academy.

It is designed for three audiences:

1. **Developers** maintaining the React/Vite portal.
2. **Design implementers** applying styling in Lovable, Figma, or similar tools.
3. **Automation reviewers** validating that a change did not drift away from the Academy brand.

## Repository scan summary

The current portal is a Vite React single-page app. The production entry point is `index.html`, the React bootstrap is `src/main.tsx`, and the app imports the active styling chain in this order:

```text
src/styles.css
src/site-theme.css
src/mobile-optimisation.css
src/global-nav-compat.css
src/global-nav-toggle.ts
```

Do not replace this chain with a separate visual language. New UI must extend the existing portal shell and token set.

## Folder contents

```text
academy-branding-workflow/
├── README.md
├── brand-tokens.json
├── portal-theme-reference.css
├── component-patterns.md
├── implementation-workflow.md
├── lovable-implementation-brief.md
├── validation/
│   └── check-branding.mjs
└── github-actions/
    └── brand-governance.yml
```

## Branding source of truth

The repo-level source of truth is the live portal styling, not an external mock-up:

- `src/styles.css` defines the base portal variables, layout primitives, form controls, hero, workspace grid, cards, pills, alerts, and responsive breakpoints.
- `src/site-theme.css` aligns the portal to the broader Skunkworks Academy dark/light design system.
- `src/mobile-optimisation.css` applies mobile-first polish and safe responsive behaviour.
- `src/global-nav-compat.css` protects the fallback portal header and global navigation behaviour.

## Non-negotiable brand rules

1. Use `en-ZA` document language where HTML pages are created.
2. Keep the Skunkworks Academy metadata pattern: `data-skunkworks-head="mandatory-v1"`, canonical URL, Open Graph tags, Twitter card tags, and favicon references.
3. Preserve the dual-mode brand system: dark default with light-mode support through CSS variables and `prefers-color-scheme`.
4. Use the Academy gradient family: purple `#7c3aed`, cyan `#06b6d4`, and portal teal accents where the current app already uses them.
5. Keep rounded, glass-like cards with visible borders, strong spacing, and mobile-safe layouts.
6. Maintain global navigation links across Home, Self-paced, Portal, Labs, Plans, Purchase, Jobs, Docs, and IBM.
7. Do not introduce unrelated frameworks or theme engines without a migration plan.
8. Do not hard-code production secrets, Entra client secrets, Graph tokens, or API credentials into frontend code.

## How to use this workflow

### 1. Start with the implementation workflow

Read [`implementation-workflow.md`](./implementation-workflow.md) before changing UI files. It gives the scan, map, implement, validate, and PR process.

### 2. Apply the reference tokens

Use [`brand-tokens.json`](./brand-tokens.json) as the machine-readable token map and [`portal-theme-reference.css`](./portal-theme-reference.css) as a safe CSS reference for new pages or components.

### 3. Use the component patterns

Use [`component-patterns.md`](./component-patterns.md) when creating new dashboard sections, cards, forms, alerts, role panels, or navigation elements.

### 4. Give Lovable a strict brief

Use [`lovable-implementation-brief.md`](./lovable-implementation-brief.md) when asking Lovable to generate or refactor portal screens. The brief prevents theme drift.

### 5. Validate before merging

Run the validator from the repository root:

```bash
node academy-branding-workflow/validation/check-branding.mjs
```

To wire this into GitHub Actions, copy the included workflow template:

```bash
mkdir -p .github/workflows
cp academy-branding-workflow/github-actions/brand-governance.yml .github/workflows/brand-governance.yml
```

This keeps the deliverable self-contained in one root folder while still providing a CI-ready template.

## Recommended change discipline

- Use small PRs for branding changes.
- Include screenshots for pages affected by visual work.
- Confirm desktop, tablet, and mobile layouts.
- Confirm dark mode and light mode.
- Run `npm test`, `npm run validate:global-nav`, and `npm run build` when dependencies are available.

## Owner intent

The portal must look and feel like Skunkworks Academy: technical, credible, dark-first, premium, responsive, and operationally ready. Any generated UI must inherit this system instead of producing a generic SaaS dashboard.