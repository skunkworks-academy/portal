import { DefaultAzureCredential } from "@azure/identity";
import { app, type HttpRequest } from "@azure/functions";
import { requireUser } from "./auth.js";
import { CosmosLmsStore } from "./lmsCosmosStore.js";
import { empty, failure, HttpError, json, readJson } from "./http.js";
import type { SkunkieLearnerAssessment, SkunkieLearnerProfile } from "../src/learner-assessment/model.js";
import type { IdRRoadmap } from "../src/idr/model.js";
import { createLearnerJourney } from "../src/learner-assessment/journey.js";

const credential = new DefaultAzureCredential();
const assessmentCollection = "skunkie-assessment-v1";
const roadmapCollection = "student-idr-v1";

async function context(request: HttpRequest) {
  const user = await requireUser(request);
  const tenant = (process.env.ENTRA_TENANT_ID ?? "").toLowerCase();
  if (!tenant || user.tenantId?.toLowerCase() !== tenant) throw new HttpError(403, "Academy learner membership is not provisioned.");
  const organizationId = process.env.LMS_HOME_ORGANIZATION_ID;
  const endpoint = process.env.LMS_COSMOS_ENDPOINT;
  const database = process.env.LMS_COSMOS_DATABASE;
  const container = process.env.LMS_COSMOS_CONTAINER;
  if (!organizationId || !endpoint || !database || !container) throw new HttpError(503, "Learner record storage is not configured.");
  const store = new CosmosLmsStore(endpoint, database, container, async () =>
    (await credential.getToken("https://cosmos.azure.com/.default")).token);
  return { user, store, key: organizationId + ":" + user.subject };
}

const approaches = ["hands_on", "examples", "reading", "discussion", "video"];
const goals = ["explore", "career", "certification", "skills"];
function strings(value: unknown, limit: number, maxLength: number): string[] {
  if (!Array.isArray(value) || value.length > limit || !value.every(s => typeof s === "string" && s.trim().length > 0 && s.length <= maxLength)) throw new HttpError(400, "Invalid assessment answer list.");
  return [...new Set(value.map((s: string) => s.trim()))];
}

export function validateSkunkieAssessment(input: unknown): SkunkieLearnerAssessment {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Invalid learner assessment.");
  const p = input as Record<string, unknown>;
  if (p.schemaVersion !== 1 || p.consentToStore !== true || !goals.includes(String(p.studyGoal)) ||
      ![15, 30, 60].includes(Number(p.preferredSessionMinutes)) ||
      ![1,2,3,4,5].includes(Number(p.selfRatedConfidence)) ||
      typeof p.assessmentId !== "string" || !/^[a-zA-Z0-9_-]{8,80}$/.test(p.assessmentId)) {
    throw new HttpError(400, "Invalid learner assessment.");
  }
  const preferredApproaches = strings(p.preferredApproaches, 5, 20);
  if (preferredApproaches.length === 0 || preferredApproaches.some(s => !approaches.includes(s))) throw new HttpError(400, "Invalid learning approach.");
  const interests = strings(p.interests, 12, 80);
  const supportNeeds = strings(p.supportNeeds, 8, 120);
  if (p.notes !== undefined && (typeof p.notes !== "string" || p.notes.length > 1000)) throw new HttpError(400, "Invalid notes.");
  if (p.language !== undefined && (typeof p.language !== "string" || p.language.length > 32)) throw new HttpError(400, "Invalid language.");
  let journey: SkunkieLearnerAssessment["journey"];
  if (p.journey !== undefined) {
    try { journey = createLearnerJourney(p.journey); }
    catch { throw new HttpError(400, "Invalid learner journey configuration or practice answers."); }
  }
  // Timestamps are server authoritative. Questionnaire does not assess aptitude or diagnose disability.
  return {
    schemaVersion: 1, assessmentId: p.assessmentId, updatedAt: new Date().toISOString(),
    consentToStore: true,
    studyGoal: p.studyGoal as SkunkieLearnerAssessment["studyGoal"],
    preferredApproaches: preferredApproaches as SkunkieLearnerAssessment["preferredApproaches"],
    preferredSessionMinutes: p.preferredSessionMinutes as 15 | 30 | 60,
    selfRatedConfidence: p.selfRatedConfidence as 1 | 2 | 3 | 4 | 5,
    interests, supportNeeds,
    ...(p.language ? { language: p.language as string } : {}),
    ...(p.notes ? { notes: p.notes as string } : {}),
    ...(journey ? { journey } : {})
  };
}

app.http("skunkieLearnerAssessmentGet", {
  methods: ["GET"], authLevel: "anonymous", route: "me/skunkie/assessment",
  handler: async request => {
    try {
      const { store, key } = await context(request);
      return json(request, await store.get<SkunkieLearnerProfile>(assessmentCollection, key));
    } catch (error) { return failure(request, error); }
  }
});
app.http("skunkieLearnerAssessmentSave", {
  methods: ["PUT"], authLevel: "anonymous", route: "me/skunkie/assessment",
  handler: async request => {
    try {
      const { user, store, key } = await context(request);
      const input = validateSkunkieAssessment(await readJson<unknown>(request));
      // Older assessment editors do not submit journey fields. Preserve the
      // saved configuration when those editors update the original questionnaire.
      if (!input.journey) {
        const existing = await store.get<SkunkieLearnerProfile>(assessmentCollection, key);
        if (existing?.assessment.journey) input.journey = existing.assessment.journey;
      }
      const record: SkunkieLearnerProfile = {
        schemaVersion: 1, learnerSubject: user.subject, assessment: input,
        updatedAt: input.updatedAt, aptitudeEvidence: []
      };
      await store.put(assessmentCollection, key, record);
      return json(request, record);
    } catch (error) { return failure(request, error); }
  }
});
app.http("skunkieLearnerAssessmentDelete", {
  methods: ["DELETE"], authLevel: "anonymous", route: "me/skunkie/assessment",
  handler: async request => {
    try {
      const { store, key } = await context(request);
      await store.delete(assessmentCollection, key);
      return empty(request);
    } catch (error) { return failure(request, error); }
  }
});
app.http("studentIdrGet", {
  methods: ["GET"], authLevel: "anonymous", route: "me/idr/roadmap",
  handler: async request => {
    try {
      const { store, key } = await context(request);
      return json(request, await store.get<IdRRoadmap>(roadmapCollection, key));
    } catch (error) { return failure(request, error); }
  }
});
app.http("studentIdrSaveDraft", {
  methods: ["PUT"], authLevel: "anonymous", route: "me/idr/roadmap",
  handler: async request => {
    try {
      const { user, store, key } = await context(request);
      const body = await readJson<unknown>(request);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, "Invalid roadmap.");
      const p = body as Record<string, unknown>;
      // This endpoint accepts only a draft, and is not a route for approving AI decisions.
      if (p.schemaVersion !== 1 || p.reviewState !== "draft" || typeof p.roadmapId !== "string" ||
          !/^idr-[a-zA-Z0-9_-]{8,80}$/.test(p.roadmapId) || typeof p.assessmentId !== "string" ||
          typeof p.targetRole !== "string" || p.targetRole.length > 120 ||
          !Array.isArray(p.milestones) || p.milestones.length > 60 ||
          !Array.isArray(p.strengths) || !Array.isArray(p.skillGaps) || !Array.isArray(p.recommendations) ||
          p.milestones.length > 0 || p.strengths.length > 0 || p.skillGaps.length > 0 || p.recommendations.length > 0) {
        throw new HttpError(400, "Only an empty, unreviewed roadmap shell can be submitted; generated career plans require staff review.");
      }
      const existing = await store.get<IdRRoadmap>(roadmapCollection, key);
      if (existing) throw new HttpError(409, "An IDR already exists. Use the reviewed revision workflow to make changes.");
      const timestamp = new Date().toISOString();
      const record: IdRRoadmap = {
        schemaVersion: 1, roadmapId: p.roadmapId, assessmentId: p.assessmentId,
        learnerSubject: user.subject, createdAt: timestamp, updatedAt: timestamp,
        revision: 1, reviewState: "draft", targetRole: p.targetRole,
        strengths: [], skillGaps: [], milestones: [], recommendations: [], author: "staff"
      };
      await store.put(roadmapCollection, key, record);
      return json(request, record);
    } catch (error) { return failure(request, error); }
  }
});
