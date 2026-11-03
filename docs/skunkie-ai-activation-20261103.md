# Skunkie AI — controlled production activation and region decision

**As of 3 November 2026: not production ready.** `https://api.skunkworksacademy.com/api/health` currently reports `skunkieSettings.configured: false`. The authenticated Skunkie HTTP routes and mobile UI exist; a working Azure OpenAI resource/deployment and backend settings do not. The successful source fix [PR #137](https://github.com/skunkworks-academy/portal/pull/137) is not proof that model replies work.

## Evidence and capacity snapshot

On 1 November 2026, the existing Azure-federated, read-only [quota audit 41342450864](https://github.com/skunkworks-academy/portal/actions/runs/41342450864) reported these **subscription-specific historical observations**:

| Azure region | Model / deployment type inspected | Used | Limit |
| --- | --- | ---: | ---: |
| South Africa North | gpt-4o-mini, Global Standard | 0 | 0 |
| South Africa North | gpt-4o, Global Standard | 0 | 0 |
| Sweden Central | gpt-4o-mini, regional Standard | 0 | 450 |
| Sweden Central | gpt-4o, regional Standard | 0 | 150 |
| Sweden Central | gpt-4o-mini, Global Standard | 0 | 0 |
| France Central | gpt-4o, regional Standard | 0 | 150 |

The Sweden Central model-capacity query found a `Standard` gpt-4o-mini capacity row with `availableCapacity:450`. The quota API labelled these quota values as `Count`; **do not call them tokens per minute or guaranteed capacity**. South Africa North results do not rule out other models/deployment types or a later quota increase. These are historical results, not current permission to deploy.

For repeatable current measurements, merge the sibling `.github/workflows/skunkie-regional-quota-audit.yml` workflow and manually invoke **Actions → Skunkie regional interactive quota audit (read-only) → Run workflow**. It uses existing GitHub OIDC and the protected `production` environment; it does **not** provision, change settings, fetch AI keys, select a model, or activate Skunkie.

## Required business choice: location of learner-prompt processing

1. **Preferred, if South African processing is required:** Verify a suitable interactive model and available **regional Standard** quota in South Africa North, request quota if needed, and obtain a written compliance and budget sign-off before provisioning.
2. **Conditional alternative:** Sweden Central `gpt-4o-mini` regional Standard showed available quota in the previous audit. **Do not use it** until the authorized owner approves European processing of learner prompts and relevant POPIA cross-border transfer safeguards, privacy disclosures, supplier terms, retention and technical controls.
3. **Do not silently substitute Global Standard**: model inference can be processed outside the resource's geography. Resource location is not the same thing as prompt-processing location.

Current Microsoft guidance: [deployment types and processing locations](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/deployment-types) and [regional model availability](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure-region-availability). Check the subscription's latest eligibility/quota in Azure before any change.

## Production deployment sequence (requires an authorized Azure/GitHub administrator)

1. Confirm **approved model, deployment type, region, subscription, budget/alerts, and data-processing terms**. Verify current capacity through the read-only workflow.
2. In that authorized Azure subscription, identify an existing compatible Azure OpenAI resource or explicitly approve provisioning a new one. Deploy a chat-completions compatible model with a known deployment name and approved networking/access policy. **This document does not execute Azure create/update commands.**
3. In GitHub `skunkworks-academy/portal → Settings → Environments → production`, configure:
   - Variable `PORTAL_AZURE_OPENAI_ENDPOINT`: the actual HTTPS Azure OpenAI resource endpoint.
   - Variable `PORTAL_AZURE_OPENAI_DEPLOYMENT`: the actual provisioned model deployment **name**, not merely the model family.
   - Variable `PORTAL_AZURE_OPENAI_API_VERSION`: optional, verified supported chat-completions version (current source default `2024-10-21`).
   - Secret `PORTAL_AZURE_OPENAI_API_KEY`: server-only resource API key. Never send it through ChatGPT, GitHub issues, comments, frontend `VITE_*` variables, browser code or screenshots.
4. **After approval** manually run the existing protected [Deploy Azure Function](https://github.com/skunkworks-academy/portal/actions/workflows/deploy-azure-function.yml) workflow. It restores backend-only configuration after Bicep provisioning. Do not bypass the production environment's review controls or use an unapproved region.
5. Accept only after:
   - [ ] Public `GET /api/health` responds `ok: true`, `skunkieSettings.configured: true`, and exposes no model key/endpoint.
   - [ ] Anonymous `GET /api/skunkie/status` and `POST /api/skunkie/chat` reject with 401/403.
   - [ ] An authorized home-tenant Microsoft learner receives a **real generated response**; no duplicate history, invented replies, or leaked provider errors.
   - [ ] iPhone Safari and embedded-browser keyboard, scrolling, close button, retry and account-switch session clearing work.
   - [ ] Quota/429, timeout, spend alerts, telemetry redaction and emergency disable/runbook are tested. Never log learner prompts, provider response bodies or API keys.
6. Record the test date, approver and sanitized results in [issue #138](https://github.com/skunkworks-academy/portal/issues/138); close only after authenticated generation succeeds.

## Remain default-deny until approved

The existing `api/skunkieFunctions.ts` requires Entra authorization, and `api/skunkieReadiness.ts` reports whether required settings exist. Do not weaken these checks to show Skunkie online. Configuration presence is **not** model availability, a successful chat, or legal approval.

No billable AI resource or change to learner-data processing should be made as a consequence of merely merging this read-only preparation.
