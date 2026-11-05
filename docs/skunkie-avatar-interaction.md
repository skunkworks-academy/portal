# Skunkie avatar and saved learner setup

This change uses portal-owned rendering and browser voice, not the Codex pet runtime or an OpenAI Realtime session. Chat still uses the authenticated Academy `/skunkie/chat` endpoint; browser dictation only fills an editable draft, and optional read-aloud speaks an actual successful response. Neither starts automatically.

## Assets and playback

- `public/assets/skunkie/skunkie-original-atlas-v1.webp` is a byte-for-byte copy of the user-approved installed Skunkie atlas, 1536 × 2288, eight columns and eleven rows, 192 × 208 cells. SHA-256: `ebf757b530b5db24f7a1d0c1e6ff99ae1a0254d3ab995f595245ad539b855f0e`. The installed pet and backups were not edited.
- `public/assets/skunkie/skunkie-conversation-atlas-v1.png` is the cleaned supplemental artwork generated for this task from that character reference. It is 1536 × 1024, eight columns and four rows, 192 × 256 cells. SHA-256: `d4f5c323d2ca78c34ea375608c4ca2191463ee79fcf10044a2f65b2bb7a79220`.
- Read-only pixel checks found 32 distinct supplemental cells, alpha extrema 0–254, all four image corners alpha 0, every body inside its cell, and feet at y=242–243. The original has transparent unused cells; the runtime only selects populated cells. The original neutral and wave frames remain the default and fallback. Supplemental listening, pondering and explanation gestures are actual artwork, not duplicated transformed frames or claimed lip synchronization.
- Both sheets use a common 192 × 256 outer stage and bottom registration. Reduced-motion preferences (OS and `data-portal-motion`) show the original neutral frame. Timers stop for hidden tabs, inactive stages and unmount; keyed account components also stop voice and discard requests.
- DOM and pixel diagnostics do not establish visual acceptance. Browser playback, light/dark appearance and responsive acceptance still require the root review; no exact Codex popup match is claimed.

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

The App now mounts this gate for the Student workspace only; Staff and Instructor workspaces and the account pages remain directly accessible. Account/help navigation stays available during setup. The gate emits `skunkworksacademy:onboarding-state` with `{active:boolean}` so the floating companion yields to the central avatar. While setup is active the body also carries `data-portal-onboarding`, hiding the sidebar toggle until a sidebar exists and removing the footer inset.

The gate reads `/me/skunkie/assessment` and only releases a learner after a successful saved profile includes a valid versioned journey with both brief example answers. Existing questionnaire-only profiles complete the new setup. A browser draft can restore unfinished choices but cannot mark setup complete. Drafts use account-specific session storage, do not save a chat transcript, and clear after confirmed persistence. Consent is requested again on reload. A failed account read prevents a defaults-only overwrite. New journey persistence requires the accompanying service/schema change (`a15de60`, cherry-picked as `bed45ab`); an older server that strips the journey cannot unlock the dashboard.

`LearnerWorkspacePlan` accepts the confirmed profile, the canonical `loadAcademyCatalogue` function, and host callbacks `onEdit`, `onOpenPractice`, `onOpenLearning`, `onBrowse`. It changes actual activity ordering, session time allocation and help disclosure, and ranks only real published metadata with validated overview URLs. It does not invent enrolments, lesson content, eligibility, progress or completion. Suggested difficulty ranks published levels; it does not rewrite course difficulty. Match explanations show the actual interest/metadata basis.

The Networking loop merged in PR151 remains the sole course-bound diagnostic/activity/outcome flow. Session minutes are kept aligned with `assessment.preferredSessionMinutes`, which that service already consumes. Its actual diagnostic and follow-up evidence govern its next activity. Other subjects do not gain invented adaptive course execution from these settings.

## Browser capability and privacy

[MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) documents limited browser availability and that some implementations use a server recognition service. Text remains usable when it is unavailable or permission is denied. [MDN SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) documents the browser read-aloud queue and cancellation. We cancel only when this hook owns a queued utterance. No new provider credentials or browser API keys are introduced.

## Checks

Behavior fixtures use jsdom with mocked authentication, requests, microphone and speech APIs. They never write real learner records or send chat messages. They cover late account responses, retained failed drafts, new edits while a request is pending, saved-server confirmation, legacy-server rejection, hidden/reduced-motion cleanup, account preferences and real metadata selection. The integrated App resets all private workspace state at the Microsoft account boundary and reports parent request failures in every workspace. A delayed previous-account profile read cannot create a registration after unmount. All runtime role, permission and course access checks remain server owned.

Integration validation: 194 tests in 37 files pass with two workers; frontend and Azure Functions TypeScript builds pass. First-run and returning-account visual acceptance is tracked separately from these fixtures. Live AI replies still require the existing provider configuration; browser voice features never synthesize a successful provider response.
