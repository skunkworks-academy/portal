# Public-page sign-in and Connections branding

## Behaviour

Public Academy Sign in links supply an encoded `returnTo` navigation hint to the portal root. The portal validates it, stores only the URL and timestamp in tab-scoped sessionStorage for at most 30 minutes, and removes the hint from the address bar before MSAL records the login request URL. After MSAL resolves an account, a focused, keyboard-accessible page offers **Return to page** or **Open my portal**. Neither choice changes account permissions. Private workspace components are not rendered before the choice. Invalid destinations fall back to the normal portal.

This is a navigation feature, not a cross-origin session bridge. It does not copy tokens, set shared authentication cookies, change registered OIDC redirects, or relax the BFF's local return-path policy. Public sites must continue to verify their own authenticated session rather than trusting a return URL.

Approved destinations use exact HTTPS host matching. Credentials, custom ports, authentication/API routes, OAuth response parameters, nested redirect parameters and malformed encodings are rejected. Only the public Connections path is allowed on the portal host.

## Connections

The existing Vite entry imports an additive, scoped brand stylesheet and shared-shell bootstrap. The catalogue, saved pathways and planner are unchanged. Academy colours and Inter/Open Sans typography follow `skunkworks-academy/brand`; spacing, radii, minimum control sizes and motion conventions follow `skunkworks-africa/theme`. A monochrome corporate palette is not substituted for Academy identity. The fallback header remains until the canonical header exists.

## Rollout and validation

Deploy the portal change before the companion `skunkworks-academy/www` public-link helper. Both repositories must be published for the public-site-to-portal flow.

Run `npm test -- tests/publicReturn.test.ts`, `npm run build`, and the repository's normal CI checks. Then test real Entra sign-in from a public URL containing search filters and an anchor, both choices, cancelled sign-in, a fresh direct portal visit, blocked storage, mobile keyboard navigation, and light/dark theme overrides. Confirm exactly one shared header and that Connections filtering/saving/planning still work.

Local validation used the 46 security/state test cases with a Node test-runner adapter, strict TypeScript compilation of the URL helper, TSX syntax transpilation, JavaScript syntax checks, and Chromium component fixtures at 360px/1280px across four OS/explicit-theme combinations. This is not a full repository build, full-page accessibility audit or live Entra end-to-end verification.
