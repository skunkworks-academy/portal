import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/App";
import { skunkworksTenantId } from "../src/authConfig";

const auth = vi.hoisted(() => ({ accounts: [] as any[], instance: {} }));
vi.mock("@azure/msal-react", () => ({ useMsal: () => auth }));
vi.mock("../src/AccountPages", () => ({ AccountPreferences: () => null, AccountPages: () => null }));
// These fixtures isolate role selection; the saved-setup gate has its own DOM tests.
vi.mock("../src/LearnerOnboardingGate", () => ({ LearnerOnboardingGate: ({ children }: { children: (profile: null, edit: () => void) => React.ReactNode }) => children(null, () => {}) }));
vi.mock("../src/student-experience", () => ({ StudentExperience: () => <main>Student workspace</main> }));
vi.mock("../src/academy-workspace", () => ({ AcademyWorkspace: ({ role }: { role: string }) => <main>{role} workspace</main> }));
afterEach(() => vi.unstubAllGlobals());
function render(roles: string[], storedRole = "Student") {
  auth.accounts = [{ homeAccountId: "account-a", localAccountId: "a", name: "Synthetic", username: "a@example.invalid", tenantId: skunkworksTenantId, idTokenClaims: { tid: skunkworksTenantId, oid: "a", roles } }];
  vi.stubGlobal("window", { location: { search: "", href: "https://portal.skunkworksacademy.com/" } });
  vi.stubGlobal("localStorage", { getItem: (key: string) => key === "portalRoleAccount" ? "account-a" : key === "portalRoleOverride" ? storedRole : null });
  return renderToStaticMarkup(<App />);
}
describe("workspace choices from assigned claims", () => {
  it.each([["Portal.Staff"], ["Portal.Instructor"], ["Portal.Admin"]])("does not offer or restore Student for management-only %j", (...roles) => {
    const html = render(roles);
    expect(html).not.toContain(">Student</button>");
    expect(html).not.toContain("Student workspace</main>");
  });
  it("honors all three assigned roles and restores the authorized Student choice", () => {
    const html = render(["Portal.Staff", "Portal.Instructor", "Portal.Student"]);
    for (const role of ["Student", "Instructor", "Staff"]) expect(html).toContain(`>${role}</button>`);
    expect(html).toContain("Student workspace</main>");
  });
  it("keeps the ordinary learner default and normalizes explicit Student claims", () => {
    expect(render([])).toContain("Student workspace</main>");
    expect(render(["Portal.Instructor", "portal.student"])).toContain("Student workspace</main>");
  });
});
