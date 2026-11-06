# Skunkie mobile incident — root cause and remediation (30 October 2026)

## Verified evidence
The completed Azure Functions deployment run 41078019845 exposed non-secret health fields indicating that Skunkie was not configured: skunkieSettings.configured was false and deployment was null. The handler already existed and was registered indirectly via api/entrypoint.ts -> api/functions.ts -> api/skunkieFunctions.ts. The issue is not an absent Function route; the Azure OpenAI model configuration was missing.

## Changes
- Replace the oversized iOS floating chat with a viewport-bounded bottom-anchored panel. The close button stays visible; the conversation scrolls independently; the textarea remains usable above browser controls.
- Display helpful, accessible HTTP/connection errors instead of appending fake assistant replies to the conversation. Keep failed question text for retry.
- Add a protected GET /api/skunkie/status endpoint that reports only configuration readiness, not tenant secrets. A healthy config does not by itself prove real model reachability.
- Only use a green status indicator following a genuine successful AI response; blue indicates configuration present and amber indicates an error.
- Set a bounded upstream request timeout and avoid logging provider response bodies or personal email addresses.
- Add production deployment settings restoration after the Bicep infrastructure step, plus route and readiness smoke tests.

## Required production GitHub Actions configuration
Open skunkworks-academy/portal -> Settings -> Environments -> production. These settings require permission from an authorised administrator:

Variables:
PORTAL_AZURE_OPENAI_ENDPOINT = the HTTPS endpoint of a provisioned Azure OpenAI resource.
PORTAL_AZURE_OPENAI_DEPLOYMENT = name of an existing deployed Azure OpenAI chat model.
PORTAL_AZURE_OPENAI_API_VERSION = optional supported Azure OpenAI API version (default 2024-10-21).

Secret:
PORTAL_AZURE_OPENAI_API_KEY = the Azure OpenAI API key. Never place it in source code, frontend variables, screenshots, logs or issue comments.

Only after these required values exist, re-run the Deploy Azure Function workflow. Configuration gets restored on infrastructure redeploy. If absent, deployment should not falsely report chat as functional and the client will display an availability notice.

## Acceptance tests
1. The production API health response reports skunkieSettings.configured = true, without exposing endpoint/key/deployment strings.
2. GET /api/skunkie/status responds with available true for a valid delegated Microsoft session and 401/403 for anonymous traffic.
3. A real student can ask one question and receive a genuine model response without a duplicated prompt. Record success, not the prompt content.
4. In iPhone Safari and embedded browser, open Skunkie, access the header close button, scroll the chat, type with the software keyboard, and close the panel.
5. On a provider or network failure, typed text is retained and an accurate retryable message is displayed.
6. On an unconfigured environment, never show a green online indicator or fabricate a model response.

## Security
Microsoft Entra ID API authentication remains mandatory. Public GitHub Pages never receives an Azure OpenAI key. Do not expose internal provider failures or raw learner conversations through standard telemetry.
