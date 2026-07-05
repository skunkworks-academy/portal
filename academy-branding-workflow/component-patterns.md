# Portal Component Patterns

Use these patterns when adding or refactoring portal UI. The goal is consistency with the current React app and the wider Skunkworks Academy ecosystem.

## 1. Page shell

Use the existing portal shell classes rather than creating a new app wrapper.

```tsx
<div className="portal-page">
  <GlobalHeader />
  <main id="main" className="portal-main">
    {/* sections */}
  </main>
</div>
```

Expected behaviour:

- `portal-page` owns the full viewport.
- `portal-main` controls the page width and bottom spacing.
- The header remains sticky and compatible with the global Academy navigation.

## 2. Header and brand

Use this structure for fallback or repo-local navigation:

```tsx
<header className="top" data-fallback-header="true">
  <div className="shell nav">
    <a className="brand" href="https://skunkworksacademy.com/">
      <img className="brand-logo logo-light" src="...favicon-black.png" alt="" />
      <img className="brand-logo logo-dark" src="...favicon-white.png" alt="" />
      <span>Skunkworks Academy <span className="brand-section">Portal</span></span>
    </a>
    <nav className="links" aria-label="Primary portal navigation">
      {/* globalNav links */}
    </nav>
  </div>
</header>
```

Rules:

- Keep `.top[data-fallback-header="true"]` so `global-nav-compat.css` can hide it when the external global nav is active.
- Keep `logo-light` and `logo-dark` pairs for light/dark support.
- Do not remove `aria-current="page"` on the portal link.

## 3. Hero sections

Use a single strong hero near the top of every major page.

```tsx
<section className="portal-hero" id="overview">
  <div className="hero-copy">
    <p>Skunkworks Academy Portal</p>
    <h1>Operationally useful headline.</h1>
    <span>Clear explanation of who the page is for and what action it enables.</span>
    <div className="landing-actions">
      <button className="primary-action large">Primary action</button>
      <a className="ghost-action large" href="...">Secondary action</a>
    </div>
  </div>
</section>
```

Rules:

- Use one primary action only.
- Keep headings short and executive-readable.
- Use the existing gradient system; do not add stock-photo backgrounds.

## 4. Dashboard grids

Use the repo's grid primitives:

```tsx
<section className="workspace-grid">
  <div className="section-head full-span">...</div>
  <article className="role-entry">...</article>
  <article className="role-entry selected">...</article>
</section>

<section className="dashboard-grid">
  <CommandPanel title="..." eyebrow="...">...</CommandPanel>
  <CommandPanel title="..." eyebrow="...">...</CommandPanel>
</section>

<section className="content-grid">
  <section className="command-panel">...</section>
  <section className="command-panel">...</section>
</section>
```

Rules:

- Use `.workspace-grid` for three role or entry cards.
- Use `.dashboard-grid` and `.content-grid` for two-column operational content.
- Always test at `980px`, `860px`, `680px`, and `560px` widths.

## 5. Cards and panels

Use `.command-panel` for major functional areas and `.card` for repeated records.

```tsx
<article className="command-panel">
  <p className="eyebrow">Operations</p>
  <h2>Staff readiness</h2>
  <p>Short support copy.</p>
  <div className="card-grid">
    <article className="card">
      <span className="pill">Live</span>
      <h3>Course title</h3>
      <p>Course summary.</p>
    </article>
  </div>
</article>
```

Rules:

- Keep visual hierarchy: eyebrow, heading, summary, records.
- Avoid long paragraphs inside cards.
- Use `.pill` for short state, level, or status labels.

## 6. Forms

Use `.form-panel` for forms.

```tsx
<form className="form-panel" onSubmit={handleSubmit}>
  <label>
    Display name
    <input name="displayName" required />
  </label>
  <label className="full">
    Bio
    <textarea name="bio" />
  </label>
  <button type="submit">Save profile</button>
</form>
```

Rules:

- Labels must wrap inputs for accessibility.
- Use `.full` for full-width fields.
- Keep submit buttons explicit: `Save profile`, `Create class`, `Submit application`.

## 7. Alerts

Use one alert surface.

```tsx
{notice && <div className="alert">{notice}</div>}
{error && <div className="alert error">{error}</div>}
{loading && <div className="alert warning">Working on the portal request…</div>}
```

Rules:

- Do not use browser `alert()` for product flows.
- Use plain, actionable copy.

## 8. Metadata pattern for static pages

Every static HTML page must include:

```html
<html lang="en-ZA">
<meta charset="utf-8" data-skunkworks-head="mandatory-v1" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="author" content="Skunkworks Academy" />
<meta property="og:site_name" content="Skunkworks Academy" />
<meta name="twitter:card" content="summary_large_image" />
```

## 9. Accessibility requirements

- Every navigation region needs an `aria-label`.
- Use semantic `section`, `article`, `header`, `main`, `nav`, `dl`, `dt`, and `dd` where appropriate.
- Maintain visible focus states inherited from browser defaults or explicit styles.
- Use decorative image `alt=""` for favicon logo marks only; meaningful images need descriptive alt text.

## 10. Anti-patterns

Do not introduce:

- Generic SaaS blue-only themes.
- Inline styles for reusable components.
- New button shapes that conflict with rounded pill/nav patterns.
- Fixed-width desktop-only tables.
- Separate mobile components when CSS can handle the responsive state.
- Secret values in frontend files.
