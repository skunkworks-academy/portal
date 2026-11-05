// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearnerOnboardingGate, hasSavedLearnerJourney, onboardingDraftKey } from "../src/LearnerOnboardingGate";
import { createLearnerJourney, journeyQuestions } from "../src/learner-assessment/journey";
import type { SkunkieLearnerProfile, SkunkieLearnerAssessment } from "../src/learner-assessment/model";
const auth = vi.hoisted(() => ({ accounts: [{ homeAccountId: "a" }], instance: {} }));
const api = vi.hoisted(() => ({ mySkunkieAssessment: vi.fn(), saveSkunkieAssessment: vi.fn() }));
vi.mock("@azure/msal-react", () => ({ useMsal: () => auth }));
vi.mock("../src/api", () => ({ portalApi: api }));
const assessment: SkunkieLearnerAssessment = { schemaVersion: 1, assessmentId: "assessment-test", updatedAt: "2026-11-05", consentToStore: true, studyGoal: "skills", preferredApproaches: ["hands_on"], preferredSessionMinutes: 30, selfRatedConfidence: 3, interests: ["network"], supportNeeds: [] };
const journey = createLearnerJourney({ version: 1, workspaceConfiguration: { sessionMinutes: 30, difficulty: "foundation", helpLevel: "guided", preferredOrder: "concept-first", practiceProportion: 50 }, checkAnswers: journeyQuestions.map(question => ({ questionId: question.id, questionVersion: 1, answerId: "not-sure" })) });
const saved: SkunkieLearnerProfile = { schemaVersion: 1, learnerSubject: "a", updatedAt: "2026-11-05", assessment: { ...assessment, journey }, aptitudeEvidence: [] };
let host: HTMLDivElement; let root: Root;
function Gate({ enabled = true }: { enabled?: boolean }) { return <LearnerOnboardingGate enabled={enabled}>{profile => <p data-testid="workspace">Workspace {profile?.learnerSubject}</p>}</LearnerOnboardingGate>; }
async function render(enabled = true) { await act(async () => root.render(<Gate enabled={enabled} />)); }
async function submit() { await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  auth.accounts = [{ homeAccountId: "a" }]; api.mySkunkieAssessment.mockReset().mockResolvedValue(null); api.saveSkunkieAssessment.mockReset(); sessionStorage.clear(); localStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
describe("durable first-run learner setup", () => {
  it("opens only a confirmed saved journey, never browser-only or old preference records", async () => {
    expect(hasSavedLearnerJourney({ ...saved, assessment })).toBe(false);
    sessionStorage.setItem(onboardingDraftKey("a"), JSON.stringify({ step: 3, assessment, journey, consent: true }));
    await render(); expect(host.querySelector('[data-testid="workspace"]')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
    expect(host.textContent).toContain("Review and save");
  });
  it("retains draft and gate on failed save, then opens only after server confirms journey", async () => {
    sessionStorage.setItem(onboardingDraftKey("a"), JSON.stringify({ step: 3, assessment, journey, consent: false }));
    api.saveSkunkieAssessment.mockRejectedValueOnce(Error("offline")).mockResolvedValueOnce(saved);
    await render(); act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()); await submit();
    expect(host.querySelector('[data-testid="workspace"]')).toBeNull(); expect(host.textContent).toContain("answers are still here"); expect(sessionStorage.getItem(onboardingDraftKey("a"))).not.toBeNull();
    await submit(); expect(host.querySelector('[data-testid="workspace"]')?.textContent).toContain("Workspace a"); expect(sessionStorage.getItem(onboardingDraftKey("a"))).toBeNull();
  });
  it("rejects a response from an older server that stripped the journey", async () => {
    sessionStorage.setItem(onboardingDraftKey("a"), JSON.stringify({ step: 3, assessment, journey, consent: false }));
    api.saveSkunkieAssessment.mockResolvedValue({ ...saved, assessment }); await render();
    act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()); await submit();
    expect(host.querySelector('[data-testid="workspace"]')).toBeNull(); expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });
  it("does not save defaults if the existing account profile failed to load", async () => {
    api.mySkunkieAssessment.mockRejectedValue(Error("blocked")); await render();
    expect(host.textContent).toContain("Retry account check"); expect(api.saveSkunkieAssessment).not.toHaveBeenCalled(); expect(host.querySelector('[data-testid="workspace"]')).toBeNull();
  });
  it("does not let a late account-A result open the account-B workspace", async () => {
    let resolveA!: (profile: SkunkieLearnerProfile) => void;
    api.mySkunkieAssessment.mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve; })).mockResolvedValueOnce(null);
    await render(); auth.accounts = [{ homeAccountId: "b" }]; await render(); await act(async () => resolveA(saved));
    expect(host.querySelector('[data-testid="workspace"]')).toBeNull(); expect(host.textContent).toContain("What would you like");
  });
  it("does not gate Staff/Instructor when disabled by authoritative workspace role", async () => {
    await render(false); expect(host.querySelector('[data-testid="workspace"]')).not.toBeNull(); expect(api.mySkunkieAssessment).not.toHaveBeenCalled();
  });
});
