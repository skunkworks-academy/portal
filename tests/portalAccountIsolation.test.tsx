// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";

const auth = vi.hoisted(() => ({ accounts: [] as any[], instance: { loginRedirect: vi.fn(), logoutRedirect: vi.fn() } }));
const api = vi.hoisted(() => ({ health: vi.fn(), jobs: vi.fn(), courses: vi.fn(), classes: vi.fn(), myProfile: vi.fn(), updateProfile: vi.fn(), myClasses: vi.fn(), registerClass: vi.fn() }));
vi.mock("@azure/msal-react", () => ({ useMsal: () => auth }));
vi.mock("../src/api", () => ({ portalApi: api }));
vi.mock("../src/AccountPages", () => ({ AccountPreferences: () => null, AccountPages: () => null }));
vi.mock("../src/LearnerOnboardingGate", () => ({ LearnerOnboardingGate: ({ children }: any) => children(null, () => undefined) }));
vi.mock("../src/student-experience", () => ({ StudentExperience: ({ portalProfile, registrations, onRegister }: any) => <div><p data-testid="private-records">{portalProfile.displayName}:{registrations.map((item: any) => item.classId).join(",")}</p><button onClick={() => void onRegister("class-1")}>Register test class</button></div> }));

const tenantId = "338a8916-80d9-467c-a94a-7f61d04ef7d5";
function account(id: string) { return { homeAccountId: id, localAccountId: id, tenantId, username: `${id}@example.test`, name: id, idTokenClaims: { tid: tenantId, oid: id, roles: ["Portal.Student"] } }; }
function profile(name: string) { return { displayName: name, portalRole: "Student", phone: "", location: "", bio: "", cvFileName: "" }; }
let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks();
  auth.accounts = [account("a")];
  api.health.mockResolvedValue({ missingSettings: [] });
  for (const method of [api.jobs, api.courses, api.classes, api.myClasses]) method.mockResolvedValue([]);
  api.myProfile.mockImplementation(({ account }: any) => Promise.resolve(profile(account.homeAccountId)));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); });
async function render() { await act(async () => { root.render(<App />); }); }

describe("private workspace account boundary", () => {
  it("discards an old account's late profile and registration reads after switching", async () => {
    let finishProfile!: (value: any) => void; let finishClasses!: (value: any) => void;
    api.myProfile.mockImplementationOnce(() => new Promise(resolve => { finishProfile = resolve; }));
    api.myClasses.mockImplementationOnce(() => new Promise(resolve => { finishClasses = resolve; }));
    await render();
    auth.accounts = [account("b")]; await render();
    expect(host.querySelector('[data-testid="private-records"]')?.textContent).toBe("b:");
    await act(async () => { finishProfile(null); finishClasses([{ classId: "a-private-class" }]); });
    expect(host.querySelector('[data-testid="private-records"]')?.textContent).toBe("b:");
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it("shows a failed registration in the learner workspace", async () => {
    api.registerClass.mockRejectedValueOnce(new Error("Registration is unavailable. Please retry."));
    await render();
    await act(async () => { (host.querySelector("button") as HTMLButtonElement).click(); });
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Registration is unavailable. Please retry.");
    expect(host.textContent).not.toContain("Class registration saved.");
  });
});
