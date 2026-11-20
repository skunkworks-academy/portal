# Academy identity edge — controlled Azure deployment

The Academy identity BFF code exists in `api/identityBffFunctions.ts`. This release adds Azure Front Door routing for browser-visible `/auth/login`, `/auth/callback`, `/auth/logout`, and `/session`. **Creating the resources does not enable SSO**: enable it only after DNS, certificates, origin restrictions, persistent identity state and authentication tests are confirmed.

## Per-property routing

```text
https://<academy-property>/auth/login     --> Front Door --> /api/auth/login    (dedicated BFF Function origin)
https://<academy-property>/auth/callback  --> Front Door --> /api/auth/callback (dedicated BFF Function origin)
https://<academy-property>/auth/logout    --> Front Door --> /api/auth/logout   (dedicated BFF Function origin)
https://<academy-property>/session        --> Front Door --> /api/session       (dedicated BFF Function origin)
https://<academy-property>/*               --> Front Door --> existing static site origin
```

The Azure Front Door route uses `originPath: '/api'`, HTTPS-only forwarding, a more-specific route for auth/session and **no route cacheConfiguration**. The existing static origin remains unchanged until controlled DNS cutover. Each domain needs its **own** BFF configuration, Entra callback registration, server session and property ID. Do not share browser cookies, Entra tokens, or a single host's active session record across origins.

## Deployment prerequisites

1. Register the exact property hostname and prove domain ownership and control of the current hosting origin, CNAME/DNS records, TLS and rollback target.
2. Deploy a **dedicated** Azure Function App for that property's identity BFF, with Node runtime, Azure Table durable identity store, managed identity for table access and Entra OIDC application registration. This must NOT be the existing general API until its routing and access isolation have been independently approved.
3. Configure `IDENTITY_BFF_ENABLED=false` until all checks pass. When ready, supply `IDENTITY_BFF_CLIENT_ID`, `IDENTITY_BFF_CLIENT_SECRET` (Key Vault reference), `IDENTITY_BFF_STORAGE_ACCOUNT`, `IDENTITY_BFF_ENCRYPTION_KEY` (Key Vault reference, 32-byte base64 key), `IDENTITY_BFF_PUBLIC_ORIGIN`, `IDENTITY_BFF_REDIRECT_URI`, `IDENTITY_BFF_PROPERTY_ID`, `IDENTITY_BFF_TENANT_ID`, and `IDENTITY_BFF_FRONTDOOR_ID`. Never commit secrets.
4. Restrict ingress to the dedicated Function App with an App Service access restriction for the **AzureFrontDoor.Backend** service tag and the exact `X-Azure-FDID` value for this Front Door profile, then deny all other ingress. Verify that direct `*.azurewebsites.net/api/session` access is rejected. A header comparison alone is **not** an origin firewall.
5. Supply GitHub repository/environment variables `ACADEMY_IDENTITY_EDGE_PROPERTIES_JSON`, `ACADEMY_IDENTITY_FRONTDOOR_PROFILE`, `ACADEMY_IDENTITY_EDGE_RESOURCE_GROUP`, Azure federation `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, and `AZURE_SUBSCRIPTION_ID`. The input is an array of known properties; example structure (replace with verified values):

```json
[
  {
    "id": "portal",
    "hostname": "portal.skunkworksacademy.com",
    "staticHost": "skunkworks-academy.github.io",
    "staticHostHeader": "portal.skunkworksacademy.com",
    "bffHost": "<dedicated-azure-function-name>.azurewebsites.net"
  }
]
```

6. Manually run `.github/workflows/identity-frontdoor.yml` with `operation=plan` and review the Azure What-If and anticipated Front Door spend. Apply is blocked unless the protected `production` environment approves and `ACADEMY_IDENTITY_EDGE_ENABLE_APPLY=true` is set. No automatic production apply is wired to pushes.
7. Apply and verify the Front Door custom domain validation record and managed TLS certificate; verify the static site through the Front Door endpoint **before** switching the public DNS hostname. Roll back DNS to its original verified target if the smoke test fails.
8. Activate only the appropriate BFF configuration after the protected origin is reachable through Front Door and its direct ingress is denied. Run `.github/workflows/identity-bff-staging.yml` per hostname to verify anonymous session JSON, PKCE, transaction cookie, callback rejection, CSRF logout denial and direct-origin rejection. Then run an authorized full sign-in/sign-out in an approved test tenant with all role pathways.

## Security and release criteria

- Trusted `X-Azure-FDID` is mandatory for BFF requests; reject missing/mismatched IDs before trusting `X-Forwarded-Host`. No browser may access the Function endpoint directly. Restrict with platform-level network access rules.
- Session cookies: `__Host-swa_session`, Secure, HttpOnly, SameSite=Lax, host-only; no `Domain` attribute. Callback binding cookie likewise host-only.
- Auth and session paths must never be cached. Do not log cookies, codes, JWTs or secrets.
- Every domain remains unauthenticated until its **own** Azure BFF is deployed and verified. A session established at `portal.skunkworksacademy.com` does not magically create a session at `microsoft.skunkworksacademy.com`.
- Never set identity mode to `bff-session` while browser MSAL stores credentials in localStorage; migrate the client first under the platform validation contract.
- Require CI/build success, negative security cases, protected Azure deployment approval, actual DNS/certificate evidence, end-to-end staging login, and rollback proof before merging or claiming production SSO.

References: `infra/identity-frontdoor.bicep`, `infra/identity-bff-edge-contract.json`, `scripts/verify-identity-bff-staging.mjs`; [Microsoft: Secure Front Door origins](https://learn.microsoft.com/azure/frontdoor/origin-security), [Front Door route template](https://learn.microsoft.com/azure/templates/microsoft.cdn/profiles/afdendpoints/routes).
