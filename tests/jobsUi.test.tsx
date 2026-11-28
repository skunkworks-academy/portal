// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AccountInfo, IPublicClientApplication } from "@azure/msal-browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalLanding } from "../src/landing-page";
import { JobsWorkspace } from "../src/jobs/JobsWorkspace";
import type { JobsDashboard } from "../src/jobs/model";

const request = vi.hoisted(() => vi.fn());
vi.mock("../src/api", () => ({ jobsRequest: request }));
const account = { homeAccountId: "test", name: "Test candidate", username: "candidate@example.test" } as AccountInfo;
const auth = { account, instance: {} as IPublicClientApplication };
const dashboard: JobsDashboard = { entries: [], vacancies: [], recruiter: false, profile: null };

describe("jobs workspace screens", () => {
  let root: Root, host: HTMLDivElement;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
    request.mockReset();
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
  function button(text: string) {
    const result = [...host.querySelectorAll("button")].find(item => item.textContent?.trim() === text);
    if (!result) throw new Error("Button missing: " + text);
    return result;
  }
  it("exposes Microsoft sign-in before displaying candidate or recruiter records", async () => {
    const signIn = vi.fn();
    act(() => root.render(<PortalLanding jobs onSignIn={signIn} />));
    expect(host.querySelector("h1")?.textContent).toBe("Academy Jobs");
    expect(host.querySelector("input")).toBeNull();
    await act(async () => button("Sign in with Microsoft").click());
    expect(signIn).toHaveBeenCalledOnce(); expect(request).not.toHaveBeenCalled();
  });
  it("saves only consented form fields and offers the signed-in companion", async () => {
    request.mockImplementation(async (path: string) => path === "" ? dashboard : undefined);
    await act(async () => root.render(<JobsWorkspace auth={auth} onSignOut={vi.fn()} />));
    expect(host.textContent).not.toContain("Recruitment dashboard");
    await act(async () => button("Create profile").click());
    const form = host.querySelector("form")!;
    expect(form.checkValidity()).toBe(false);
    const check = form.elements.namedItem("consent") as HTMLInputElement;
    check.checked = true;
    expect(form.checkValidity()).toBe(true);
    await act(async () => { form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
    expect(request).toHaveBeenCalledWith("/profile", expect.objectContaining({ method: "PUT", body: expect.stringContaining('"consent":true') }), auth);
    const open = vi.fn(); window.addEventListener("academy:open-jobs-companion", open, { once:true });
    await act(async () => button("Ask Skunkie").click()); expect(open).toHaveBeenCalledOnce();
  });
  it("shows an unavailable service as an error and keeps coaching accessible", async () => {
    request.mockRejectedValue(new Error("offline"));
    await act(async () => root.render(<JobsWorkspace auth={auth} onSignOut={vi.fn()} />));
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.textContent).not.toContain("No candidate"); expect(host.querySelector("form")).toBeNull();
    expect(button("Ask Skunkie")).toBeTruthy();
  });
  it("identifies a pending Dynamics connection without collecting a candidate profile", async () => {
    request.mockRejectedValue(Object.assign(new Error('{"code":"jobs_setup_required"}'), { status: 503 }));
    await act(async () => root.render(<JobsWorkspace auth={auth} onSignOut={vi.fn()} />));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("connecting its Jobs database");
    expect(host.querySelector("form")).toBeNull();
    expect(button("Ask Skunkie")).toBeTruthy();
  });
  it("reads the hiring pipeline only when an authorised recruiter opens it", async () => {
    request.mockImplementation(async (path: string) => path === "" ? { ...dashboard, recruiter: true } : { vacancies: [], submissions: [] });
    await act(async () => root.render(<JobsWorkspace auth={auth} onSignOut={vi.fn()} />));
    expect(request.mock.calls.map(call => call[0])).toEqual([""]);
    await act(async () => button("Recruitment").click());
    expect(request.mock.calls.map(call => call[0])).toContain("/recruitment");
    expect(host.textContent).toContain("No candidate has submitted an application");
  });
});
