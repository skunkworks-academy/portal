// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearnerOnboardingGate, hasSavedLearnerJourney, onboardingDraftKey, confirmsLearnerSubmission } from "../src/LearnerOnboardingGate";
import type { AccountInfo } from "@azure/msal-browser";
import { createLearnerJourney, journeyQuestions } from "../src/learner-assessment/journey";
import type { SkunkieLearnerProfile, SkunkieLearnerAssessment } from "../src/learner-assessment/model";
const auth = vi.hoisted(() => ({ accounts: [{ homeAccountId: "a", localAccountId: "a" }], instance: {} }));
const api = vi.hoisted(() => ({ mySkunkieAssessment: vi.fn(), saveSkunkieAssessment: vi.fn(), deleteSkunkieAssessment: vi.fn() }));
vi.mock("@azure/msal-react", () => ({ useMsal: () => auth }));
vi.mock("../src/api", () => ({ portalApi: api }));
const assessment: SkunkieLearnerAssessment = { schemaVersion: 1, assessmentId: "assessment-test", updatedAt: "2026-11-05", consentToStore: true, studyGoal: "skills", preferredApproaches: ["hands_on"], preferredSessionMinutes: 30, selfRatedConfidence: 3, interests: ["network"], supportNeeds: [] };
const journey = createLearnerJourney({ version: 1, workspaceConfiguration: { sessionMinutes: 30, difficulty: "foundation", helpLevel: "guided", preferredOrder: "concept-first", practiceProportion: 50 }, checkAnswers: journeyQuestions.map(question => ({ questionId: question.id, questionVersion: 1, answerId: "not-sure" })) });
const saved: SkunkieLearnerProfile = { schemaVersion: 1, learnerSubject: "a", updatedAt: "2026-11-05", assessment: { ...assessment, journey }, aptitudeEvidence: [] };
let host: HTMLDivElement; let root: Root;
function Gate({ enabled = true }: { enabled?: boolean }) { return <LearnerOnboardingGate enabled={enabled}>{(profile, edit) => <div><p data-testid="workspace">Workspace {profile?.learnerSubject}</p><button onClick={edit}>Edit setup</button></div>}</LearnerOnboardingGate>; }
async function render(enabled = true) { await act(async () => root.render(<Gate enabled={enabled} />)); }
async function submit() { await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  auth.accounts = [{ homeAccountId: "a", localAccountId: "a" }]; api.mySkunkieAssessment.mockReset().mockResolvedValue(null); api.saveSkunkieAssessment.mockReset(); sessionStorage.clear(); localStorage.clear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
describe("durable first-run learner setup", () => {
  it("retains saved answers after failed deletion and clears the shared plan after confirmed deletion", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    api.mySkunkieAssessment.mockResolvedValue(saved);
    api.deleteSkunkieAssessment.mockReset().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    await render();
    await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Edit setup")!.click());
    const remove = () => [...host.querySelectorAll("button")].find(button => button.textContent === "Delete saved learner setup")!;
    await act(async () => remove().click());
    expect(host.textContent).toContain("Deletion could not be confirmed");
    expect(host.textContent).toContain("Keep my saved plan");
    await act(async () => remove().click());
    expect(host.textContent).toContain("Your saved learner setup was deleted");
    expect(host.querySelector('[data-testid="workspace"]')).toBeNull();
    expect(host.textContent).not.toContain("Keep my saved plan");
    expect(JSON.parse(sessionStorage.getItem(onboardingDraftKey("a"))!).assessment.interests).toEqual([]);
    confirm.mockRestore();
  });
  it("opens only a confirmed saved journey, never browser-only or old preference records", async () => {
    expect(hasSavedLearnerJourney({} as SkunkieLearnerProfile)).toBe(false);
    expect(hasSavedLearnerJourney({ ...saved, assessment })).toBe(false);
    sessionStorage.setItem(onboardingDraftKey("a"), JSON.stringify({ step: 3, assessment, journey, consent: true }));
    await render(); expect(host.querySelector('[data-testid="workspace"]')).toBeNull();
    expect(host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false);
    expect(host.textContent).toContain("Review and save");
  });
  it("retains draft and gate on failed save, then opens only after server confirms journey", async () => {
    sessionStorage.setItem(onboardingDraftKey("a"), JSON.stringify({ step: 3, assessment, journey, consent: false }));
    api.saveSkunkieAssessment.mockRejectedValueOnce(Error("offline")).mockImplementationOnce(async (input: SkunkieLearnerAssessment) => ({ ...saved, assessment: input }));
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
    expect(host.querySelector<HTMLFieldSetElement>("form > fieldset")?.disabled).toBe(true);
  });
  it("does not let a late account-A result open the account-B workspace", async () => {
    let resolveA!: (profile: SkunkieLearnerProfile) => void;
    api.mySkunkieAssessment.mockImplementationOnce(() => new Promise(resolve => { resolveA = resolve; })).mockResolvedValueOnce(null);
    await render(); auth.accounts = [{ homeAccountId: "b", localAccountId: "b" }]; await render(); await act(async () => resolveA(saved));
    expect(host.querySelector('[data-testid="workspace"]')).toBeNull(); expect(host.textContent).toContain("What would you like");
  });
  it("does not gate Staff/Instructor when disabled by authoritative workspace role", async () => {
    await render(false); expect(host.querySelector('[data-testid="workspace"]')).not.toBeNull(); expect(api.mySkunkieAssessment).not.toHaveBeenCalled();
  });
  it("retains chosen approaches and support needs through a failed save and reload", async () => {
    sessionStorage.setItem(onboardingDraftKey("a"), JSON.stringify({ step: 2, assessment, journey, consent: false }));
    api.saveSkunkieAssessment.mockRejectedValue(Error("offline")); await render();
    const choice = (text: string) => [...host.querySelectorAll("label")].find(label => label.textContent?.includes(text))!.querySelector<HTMLInputElement>("input")!;
    act(() => { choice("Hands-on practice").click(); choice("Reading and notes").click(); });
    const support = host.querySelector<HTMLTextAreaElement>('textarea[placeholder^="For example"]')!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(support, "captions,keyboard navigation"); support.dispatchEvent(new Event("input", { bubbles: true })); });
    await submit(); act(() => host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()); await submit();
    expect(api.saveSkunkieAssessment.mock.calls[0][0].preferredApproaches).toEqual(["reading"]);
    expect(api.saveSkunkieAssessment.mock.calls[0][0].supportNeeds).toEqual(["captions", "keyboard navigation"]);
    act(() => root.unmount()); root = createRoot(host); await render();
    const restored = JSON.parse(sessionStorage.getItem(onboardingDraftKey("a"))!);
    expect(restored.assessment.preferredApproaches).toEqual(["reading"]); expect(restored.assessment.supportNeeds).toEqual(["captions", "keyboard navigation"]);
    expect(host.querySelector('[data-testid="workspace"]')).toBeNull();
  });
  it("requires this account and the submitted values in the save confirmation", () => {
    const account = { localAccountId: "a" } as AccountInfo;
    expect(confirmsLearnerSubmission(saved, saved.assessment, account)).toBe(true);
    expect(confirmsLearnerSubmission({ ...saved, learnerSubject: "b" }, saved.assessment, account)).toBe(false);
    expect(confirmsLearnerSubmission({ ...saved, assessment: { ...saved.assessment, studyGoal: "career" } }, saved.assessment, account)).toBe(false);
    expect(confirmsLearnerSubmission({} as SkunkieLearnerProfile, saved.assessment, account)).toBe(false);
  });
});
