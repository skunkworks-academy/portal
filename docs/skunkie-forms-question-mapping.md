# Forms questionnaire mapping — Career Growth and Learning Assessment (1–6)

Source supplied 2026-11-04: single worksheet, columns A:AS (45 columns), six response records. **Do not commit respondent rows or contact information.** The file includes personal data; only column headings are captured here.

## Classify the existing prompts

| Columns | Existing question area | Destination |
| --- | --- | --- |
| A–F | Forms metadata: ID, timestamps, email, name | Import/audit envelope; explicit verified identity matching |
| G–P | Name, age, position, department, contact details, public profile links | Learner profile; collect minimum necessary and protect access; age/phone are not needed to infer learning aptitude |
| Q–R | Technology domains and projects of interest | Learner interests; career context |
| S–U | Short-, medium- and long-term goals | Separate career/IDR assessment |
| V–W | Weekly upskilling commitment and capacity | Career plan scheduling and learning preference profile |
| X | Preferred learning and development approach | Skunkie learner assessment (self-reported preference only) |
| Y–AA | Remote/office, collaboration, teaching/content preferences | Learner environment and interests; not fixed learning type |
| AB–AC | Leadership experience and current technical proficiency | Career/competency assessment, pending evidence |
| AD–AE | Hobbies and emerging interests | Learner interests and career context |
| AF–AG | Mentorship preference and focus | Learner support and career-plan support |
| AH–AI | Valued resources and cross-functional opportunities | Learning recommendations and career preferences |
| AJ | Preferred feedback style | Skunkie feedback preferences |
| AK–AS | Professional challenges, extra support, partnership alignment, collaboration, aspirations, use acknowledgement and open-ended notes | Separate appropriate fields across learner supports / career development; preserve provenance, purpose and retention |

## Gaps to add for a genuine Skunkie learner assessment

- Prior knowledge and conceptual understanding through accessible, calibrated tasks (not inferred from demographics).
- Learning activity behaviours: attempts, help requests, practice outcomes and revision effectiveness.
- Reading, video, demonstration and hands-on formats as **situational preferences**, not immutable visual/auditory/kinesthetic labels.
- Self-assessed confidence (tracked separately from verified performance).
- Preferred session length, difficulty, language and accessibility accommodations; make optional and avoid diagnostic inference.
- Explicit explanation, privacy control, consent/processing basis and ability to revise/delete profile.
- Learner-facing, empathetic feedback without claims that a brief survey can quantify IQ, cognitive aptitude or disability.

## Migration constraint

Do not automatically import the six legacy responses into the new live profile; the original acknowledgement is directed at career-development use, not necessarily ongoing AI personalization. Confirm lawful processing basis, notice, data minimisation, verified student identity, and whether additional permission is needed.

## Next

Build a server-side, versioned question bank and vetted competency exercises, then map form column stable IDs rather than relying only on mutable question text. Publish IDRs only after a separate skills/career assessment and human review.
