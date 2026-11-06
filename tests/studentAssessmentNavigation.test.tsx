// @vitest-environment jsdom
import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudentExperience } from "../src/student-experience";
import type { SkunkieLearnerProfile } from "../src/learner-assessment/model";

const legacyEditor = vi.hoisted(() => vi.fn(() => <p>Independent legacy editor</p>));
vi.mock("@azure/msal-react", () => ({ useMsal: () => ({ accounts: [], instance: {} }) }));
vi.mock("../src/learner-assessment/workspace", () => ({ LearnerAssessmentWorkspace: legacyEditor, IndividualRoadmapWorkspace: () => null }));
vi.mock("../src/LearnerWorkspacePlan", () => ({ LearnerWorkspacePlan: () => <p>Confirmed workspace plan</p> }));
vi.mock("../src/PortalSidebarNavigation", () => ({ PortalSidebarNavigation: () => null, usePortalSidebar: () => ({ open: false, close: () => {}, toggle: () => {} }) }));
const saved = { schemaVersion: 1, learnerSubject: "a", assessment: { journey: { version: 1 } } } as SkunkieLearnerProfile;
let host: HTMLDivElement; let root: Root;
function Page() {
  const [editing, setEditing] = useState(false);
  return editing ? <section><p>Account setup editor</p><button onClick={() => setEditing(false)}>Return after confirmed save</button></section> :
    <StudentExperience profile={null} portalProfile={{ displayName: "Learner", portalRole: "Student", phone: "", location: "", bio: "", cvFileName: "" }}
      courses={[]} classes={[]} registrations={[]} onSignIn={() => {}} onSignOut={() => {}} onRegister={async () => {}}
      savedLearnerProfile={saved} onEditLearnerProfile={() => setEditing(true)} />;
}
async function render() { await act(async () => root.render(<Page />)); }
async function finishEdit() { await act(async () => (host.querySelector("button") as HTMLButtonElement).click()); }
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  legacyEditor.mockClear(); window.history.replaceState(null, "", "/");
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); window.history.replaceState(null, "", "/"); });

describe("saved learner assessment navigation", () => {
  it("hands an initial assessment deep link to the owning gate without reopening after save", async () => {
    window.history.replaceState(null, "", "/?student=assessment&source=welcome#details");
    await render();
    expect(host.textContent).toContain("Account setup editor");
    expect(legacyEditor).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?student=dashboard&source=welcome");
    expect(window.location.hash).toBe("#details");
    await finishEdit();
    expect(host.textContent).toContain("Confirmed workspace plan");
    expect(host.textContent).not.toContain("Account setup editor");
  });
  it("handles assessment history entries and normal navigation through the same owner", async () => {
    window.history.replaceState(null, "", "/?student=dashboard&source=history"); await render();
    for (const destination of ["/?student=assessment&source=back", "/?student=assessment&source=forward"]) {
      await act(async () => { window.history.replaceState(null, "", destination); window.dispatchEvent(new PopStateEvent("popstate")); });
      expect(host.textContent).toContain("Account setup editor");
      expect(new URLSearchParams(window.location.search).get("student")).toBe("dashboard");
      expect(new URLSearchParams(window.location.search).get("source")).toBe(destination.includes("back") ? "back" : "forward");
      await finishEdit(); expect(host.textContent).toContain("Confirmed workspace plan");
    }
    await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent?.includes("My learner assessment"))!.click());
    expect(host.textContent).toContain("Account setup editor");
    expect(legacyEditor).not.toHaveBeenCalled();
  });
});
