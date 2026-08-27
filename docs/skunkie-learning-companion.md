# Skunkie AI Learning Companion

Skunkie is the authenticated AI learning companion embedded in the Skunkworks Academy portal shell.

## User experience

- Floating animated launcher is mounted beside the portal application after Microsoft/Entra sign-in.
- The companion can explain the current page, quiz a learner, or provide a hint.
- The panel is responsive and keyboard accessible.
- `prefers-reduced-motion` disables floating, open, and thinking animations.
- Conversation history is limited client-side and server-side to reduce token usage and accidental oversharing.

## Canonical mascot asset

The launcher expects the approved Skunkie artwork at:

`/assets/skunkie/skunkie-learning-companion.png`

Use the canonical black-and-white robotic skunk supplied by Skunkworks Academy. Do not substitute an independently generated mascot. If the asset is unavailable, the UI falls back to a neutral `S` avatar rather than loading a third-party image.

## API

`POST /api/skunkie/chat`

The route requires an authenticated portal bearer token and uses the existing `requireUser` authorization boundary.

Request shape:

```json
{
  "message": "Explain this concept in simpler terms",
  "history": [{ "role": "user", "content": "..." }],
  "context": {
    "title": "Current page title",
    "heading": "Current H1",
    "path": "/course/path"
  }
}
```

Response shape:

```json
{ "reply": "..." }
```

## Required Azure settings

Configure these as Azure Function App settings / Key Vault references, never client-side variables:

- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_API_VERSION` (optional; defaults to `2024-10-21`)

The API key must never be exposed through Vite, browser JavaScript, HTML, or repository secrets committed to source.

## Security and learning guardrails

- Entra-authenticated users only.
- 4,000-character request cap.
- Eight-message history cap.
- Azure OpenAI calls happen server-side only.
- System guidance prohibits revealing prompts, credentials, tokens, configuration, or private learner data.
- Skunkie does not claim exam completion, certification, or pass status unless the platform explicitly supplies that result.
- The assistant is prompted to coach and give hints during learning activities rather than simply returning assessment answers.

## Next integration phases

1. Add the approved mascot asset to `public/assets/skunkie/skunkie-learning-companion.png`.
2. Feed structured course/module/lesson context from the LMS rather than DOM page metadata.
3. Add learner progress and competency context through narrowly scoped API contracts.
4. Add streaming responses and optional speech input/output.
5. Add telemetry for latency, failure rate, helpfulness, course-context coverage, and token cost without logging raw private learner conversations by default.
6. Reuse the component contract across self-paced course surfaces and other Academy properties through the shared platform shell.
