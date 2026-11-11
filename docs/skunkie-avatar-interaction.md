# Skunkie avatar and saved learner setup

This change uses portal-owned rendering and browser voice, not the Codex pet runtime or an OpenAI Realtime session. Chat still uses the authenticated Academy `/skunkie/chat` endpoint; browser dictation only fills an editable draft, and optional read-aloud speaks an actual successful response. Neither starts automatically.

## Assets and playback

### Portal motion artwork v2 (11 November 2026)

The portal now plays **48 distinct illustrated frames**, up from 27 distinct
frames referenced by the previous sequences (21 additional playable frames).
`skunkie-motion-atlas-v2.webp` is a lossless 1728 × 3072 sheet: six columns,
eight rows, 288 × 384 cells. This is 50% more pixels on each axis than the
previous 192 × 256 conversation cells. All 48 cells contain complete artwork;
there are no unused cells in this portal-specific sheet.

The eight source strips are idle, waiting, working, review, greeting, listening,
speaking, and alternate idle. The renderer combines these into its existing
five activity states. Speaking remains an illustrated gesture cycle, not lip
synchronization. The user-owned robot-skunk reference and eight built-in
image-generation prompts/outputs are retained in `assets/skunkie-motion-v2/`.
No new third-party stock art is included.

Run `python scripts/build-skunkie-atlas.py` with Pillow to reproduce the packed
assets and `docs/skunkie-avatar-v2-validation.json`. The script detects six
connected silhouettes per source strip, uses a common scale within each row,
registers the feet to a shared baseline, preserves alpha, and encodes losslessly.
It rejects blank, duplicate, clipped, or predominantly translucent frames. The
report includes source/output hashes and per-cell bounds and opacity statistics.
Visual inspection is still required for accidental interior holes and pose
semantics; the numeric checks alone do not establish visual quality.

The component displays a separate full-resolution still while the single atlas
loads and decodes. Network or decode failure retains the still; failure of the
still leaves a visible S fallback. Activity changes only select validated cell
indices in the same loaded image, avoiding cross-sheet loading gaps. Reduced
motion uses frame 0. Animation timers stop while hidden, inactive, loading, or
unmounted. No chat, microphone, account, model, or billing behavior changes.

Review fixture: `/tests/fixtures/skunkie-avatar.html` with `npm run dev`.
Browser QA checked light/dark backgrounds, full-size and launcher-size artwork,
activity switching, and reduced motion at desktop and 390 × 844 mobile width.
All 48 frames were visually reviewed in the contact sheet: no missing body
patches or clipped limbs were observed. The desktop Codex pet was not changed.

Validation on base `7fee44f`: production frontend build passed; 43 targeted
avatar/interaction/layout/mobile/assets tests passed; full suite: 362 passed,
one failed. The failure is the pre-existing `skunkieActivation.test.ts` workflow
guard: it expects the step `Verify and activate the protected Skunkie deployment`,
which is absent in the unchanged base workflow. This avatar change does not
edit that workflow, its test, or deployment credentials. Live deployment is
not part of this local verification.

### Earlier artwork (retained for compatibility)

- `public/assets/skunkie/skunkie-original-atlas-v1.webp` is a byte-for-byte copy of the user-approved installed Skunkie atlas, 1536 × 2288, eight columns and eleven rows, 192 × 208 cells. SHA-256: `ebf757b530b5db24f7a1d0c1e6ff99ae1a0254d3ab995f595245ad539b855f0e`. The installed pet and backups were not edited.
- `public/assets/skunkie/skunkie-conversation-atlas-v1.png` is the cleaned supplemental artwork generated for this task from that character reference. It is 1536 × 1024, eight columns and four rows, 192 × 256 cells. SHA-256: `d4f5c323d2ca78c34ea375608c4ca2191463ee79fcf10044a2f65b2bb7a79220`.
- Read-only pixel checks found 32 distinct supplemental cells, alpha extrema 0–254, all four image corners alpha 0, every body inside its cell, and feet at y=242–243. The original has transparent unused cells; the runtime only selects populated cells. The original neutral and wave frames remain the default and fallback. Supplemental listening, pondering and explanation gestures are actual artwork, not duplicated transformed frames or claimed lip synchronization.
- Both sheets use a common 192 × 256 outer stage and bottom registration. Reduced-motion preferences (OS and `data-portal-motion`) show the original neutral frame. Timers stop for hidden tabs, inactive stages and unmount; keyed account components also stop voice and discard requests.
- Local browser review covered the avatar-first flow, light/dark appearance, 390px practice choices, keyboard preference selectors, saved plan ordering, floating chat and retained questions after service failure. These checks used synthetic local data, not live learner records; no exact Codex popup match is claimed.

## Integration

`LearnerOnboardingGate` is a render-prop component:

```tsx
<LearnerOnboardingGate enabled={workspaceRole === "Student"}>
  {(savedLearnerProfile, editSetup) => <StudentExperience
    {...existingProps}
    savedLearnerProfile={savedLearnerProfile}
    onEditLearnerProfile={editSetup}
  />}
</LearnerOnboardingGate>
```

The App mounts this gate only for a verified Academy-tenant learner in the Student workspace; Staff and Instructor workspaces and account pages remain directly accessible. Existing external-account behavior stays separate from the Academy-only assessment API. Account/help navigation stays available during setup. The gate emits `skunkworksacademy:onboarding-state` with `{active:boolean}` so the floating companion yields to the central avatar. While setup is active the body also carries `data-portal-onboarding`, hiding the sidebar toggle until a sidebar exists and removing the footer inset.

The gate reads `/me/skunkie/assessment` and only releases a learner after a successful saved profile includes a valid versioned journey with both brief example answers. Existing questionnaire-only profiles complete the new setup. A browser draft can restore unfinished choices but cannot mark setup complete. Drafts use account-specific session storage, do not save a chat transcript, and clear after confirmed persistence. Consent is requested again on reload. A failed account read prevents a defaults-only overwrite. New journey persistence requires the accompanying service/schema change (`a15de60`, cherry-picked as `bed45ab`); an older server that strips the journey cannot unlock the dashboard.

`LearnerWorkspacePlan` accepts the confirmed profile, the canonical `loadAcademyCatalogue` function, and host callbacks `onEdit`, `onOpenPractice`, `onOpenLearning`, `onBrowse`. It changes actual activity ordering, session time allocation and help disclosure, and ranks only real published metadata with validated overview URLs. It does not invent enrolments, lesson content, eligibility, progress or completion. Suggested difficulty ranks published levels; it does not rewrite course difficulty. Match explanations show the actual interest/metadata basis.

The Networking loop merged in PR151 remains the sole course-bound diagnostic/activity/outcome flow. Session minutes are kept aligned with `assessment.preferredSessionMinutes`, which that service already consumes. Its actual diagnostic and follow-up evidence govern its next activity. Other subjects do not gain invented adaptive course execution from these settings.

## Browser capability and privacy

[MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) documents limited browser availability and that some implementations use a server recognition service. Text remains usable when it is unavailable or permission is denied. [MDN SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) documents the browser read-aloud queue and cancellation. We cancel only when this hook owns a queued utterance. No new provider credentials or browser API keys are introduced.

## Checks

Behavior fixtures use jsdom with mocked authentication, requests, microphone and speech APIs. They never write real learner records or send chat messages. They cover late account responses, retained failed drafts, new edits while a request is pending, saved-server confirmation, legacy-server rejection, hidden/reduced-motion cleanup, account preferences and real metadata selection. The integrated App resets all private workspace state at the Microsoft account boundary and reports parent request failures in every workspace. A delayed previous-account profile read cannot create a registration after unmount. All runtime role, permission and course access checks remain server owned.

Integration validation: 260 tests in 44 files pass with two workers; frontend and Azure Functions TypeScript builds pass. Browser microphone startup shows immediate cancellable feedback, times out after 12 seconds, and distinguishes permission, capture, network and unavailable-service errors. Voice tests use mocked events; actual dictation still needs a user-controlled browser check. Live AI replies still require provider configuration; browser voice features never synthesize a successful provider response.
