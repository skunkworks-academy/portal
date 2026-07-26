# Lovable Implementation Brief

Use this brief when asking Lovable to generate or refactor Skunkworks Academy Portal screens.

## Project context

You are working inside `skunkworks-academy/portal`, a Vite React portal for Skunkworks Academy. The app supports learner, instructor, and staff workflows with Microsoft sign-in, course registration, instructor applications, profile capture, and staff operations.

The generated UI must look like the existing Skunkworks Academy Portal. Do not create a generic SaaS theme.

## Files to respect

```text
src/main.tsx
src/App.tsx
src/styles.css
src/site-theme.css
src/mobile-optimisation.css
src/global-nav-compat.css
src/global-nav-toggle.ts
```

The stylesheet import order in `src/main.tsx` must remain intact.

## Visual style

Use a dark-first premium technical interface with light-mode support.

Required style values:

- Dark background: `#050505`.
- Light background: `#f8fafc`.
- Dark-mode text: `#f5f5f5`.
- Dark-mode muted text: `#a3a3a3`.
- Dark-mode border: `#2a2a2a`.
- Accent gradient: `#7c3aed` to `#06b6d4`.
- Portal teal: `#0f766e`.
- Hero cyan: `#75f0e5`.
- Rounded cards: 18px to 28px radius.
- Glass-like cards with subtle borders and shadows.
- Strong headings with tight negative letter spacing.

## Existing classes to reuse

```text
portal-page
portal-main
top
shell nav
brand
brand-logo
links
portal-hero
hero-copy
landing-actions
workspace-grid
section-head
role-entry
dashboard-grid
content-grid
command-panel
card-grid
card
pill
form-panel
alert
```

## Navigation rules

Where navigation is rendered, include:

```text
Home
Self-paced
Portal
Labs
Plans
Purchase
Jobs
Docs
IBM
```

The Portal link should be marked as the current page where appropriate.

## Accessibility rules

- Use semantic HTML.
- Every `nav` needs an `aria-label`.
- Use real `button` elements for actions.
- Use anchors only for navigation.
- Labels must wrap form controls or be associated with `htmlFor` and `id`.
- Decorative logo images can use empty alt text; meaningful images need descriptive alt text.

## Content tone

Use concise operational wording. Avoid hype-heavy copy.

Good examples:

- `One operational front door for learners, instructors, staff and Entra-connected Academy services.`
- `Choose your entry path.`
- `Profile saved.`
- `Class registration saved.`

## Output requirement

When generating code, return focused file patches and explain:

1. Existing classes reused.
2. New classes added, if any.
3. Why the change preserves the Academy theme.
4. Which validations should be run.

## Validation command

```bash
node academy-branding-workflow/validation/check-branding.mjs
npm test
npm run validate:global-nav
npm run build
```

## Constraints

- Do not add credentials.
- Do not remove Microsoft sign-in flows.
- Do not remove role-based workspaces.
- Do not remove global navigation compatibility.
- Do not replace the CSS chain with Tailwind, Bootstrap, or a new design framework.
- Do not use stock photos as the main brand identity.
- Do not flatten the dark/light mode support.
