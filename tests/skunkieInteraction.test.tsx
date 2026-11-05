// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkunkieCompanion } from "../src/SkunkieCompanion";
import { SkunkieAvatar } from "../src/SkunkieAvatar";
import { LearnerOnboardingGate } from "../src/LearnerOnboardingGate";
import { readSkunkiePreferences, saveSkunkiePreferences } from "../src/skunkie-preferences";
const auth = vi.hoisted(() => ({ accounts: [{ homeAccountId: "account-a" }], instance: { acquireTokenSilent: vi.fn() } }));
const api = vi.hoisted(() => ({ mySkunkieAssessment: vi.fn() }));
vi.mock("@azure/msal-react", () => ({ useMsal: () => auth }));
vi.mock("../src/api", () => ({ portalApi: api }));
let host: HTMLDivElement;
let root: Root;
function click(text: string) { const item = [...host.querySelectorAll("button")].find(b => b.textContent?.includes(text) || b.getAttribute("aria-label") === text); if (!item) throw Error(`Missing button ${text}`); act(() => item.click()); }
async function render(node: React.ReactNode) { await act(async () => { root.render(node); }); }
function enter(text: string) { const input = host.querySelector("textarea")!; act(() => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, text); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function submit() { await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  Element.prototype.scrollTo = vi.fn();
  localStorage.clear(); auth.accounts = [{ homeAccountId: "account-a" }]; auth.instance.acquireTokenSilent.mockResolvedValue({ accessToken: "test-only" });
  api.mySkunkieAssessment.mockReset().mockResolvedValue(null);
  sessionStorage.clear(); document.body.removeAttribute("data-portal-onboarding");
  document.documentElement.removeAttribute("data-portal-motion");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("avatar-first Skunkie", () => {
  it.each(["", "https://example.invalid/api/"])("routes local status and chat through the proxy or explicit override %s", async configured => {
    vi.stubEnv("VITE_API_BASE_URL", configured);
    expect(window.location.hostname).toBe("localhost");
    const fetch = vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(url.endsWith("/status") ? { available: true } : { reply: "Mock response" }))));
    vi.stubGlobal("fetch", fetch);
    await render(<SkunkieCompanion />); click("Open Skunkie AI learning companion"); await act(async () => {});
    enter("Explicit test question"); await submit();
    const base = configured ? "https://example.invalid/api" : "/api";
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([`${base}/skunkie/status`, `${base}/skunkie/chat`]);
    expect(host.textContent).toContain("Mock response");
  });
  it.each(["companion", "onboarding"])("shows cancellable microphone startup in %s without sending or losing a draft", async surface => {
    const abort = vi.fn(); const start = vi.fn();
    vi.stubGlobal("SpeechRecognition", class { start = start; abort = abort; stop = vi.fn(); });
    const fetch = vi.fn().mockResolvedValue(new Response('{"available":true}')); vi.stubGlobal("fetch", fetch);
    await render(surface === "companion" ? <SkunkieCompanion /> : <LearnerOnboardingGate enabled>{() => <p>Workspace</p>}</LearnerOnboardingGate>);
    if (surface === "companion") { click("Open Skunkie AI learning companion"); await act(async () => {}); }
    enter("Keep my typed words");
    click(surface === "companion" ? "Use microphone" : "Speak my goal");
    expect(start).toHaveBeenCalledTimes(1); expect(host.textContent).toContain("Starting microphone");
    expect(host.textContent).not.toContain("Listening.");
    click("Cancel microphone startup");
    expect(abort).toHaveBeenCalledTimes(1); expect(host.textContent).toContain("Voice input was cancelled");
    expect(host.querySelector("textarea")?.value).toBe("Keep my typed words");
    expect(fetch.mock.calls.some(([url]) => String(url).endsWith("/chat"))).toBe(false);
  });
  it("observes a preceding sibling's setup on mount and restores the launcher after cleanup", async () => {
    const page = (enabled: boolean) => <><LearnerOnboardingGate enabled={enabled}>{() => <p>Workspace</p>}</LearnerOnboardingGate><SkunkieCompanion /></>;
    await render(page(true));
    expect(document.body.hasAttribute("data-portal-onboarding")).toBe(true);
    expect(host.querySelector(".learner-onboarding__avatar")).not.toBeNull();
    expect(host.querySelector(".skunkie")).toBeNull();
    await render(page(false));
    expect(document.body.hasAttribute("data-portal-onboarding")).toBe(false);
    expect(host.querySelector(".skunkie")).not.toBeNull();
  });
  it("carries the gate's text-only choice into the same mounted account companion", async () => {
    const page = (enabled: boolean) => <><LearnerOnboardingGate enabled={enabled}>{() => <p>Workspace</p>}</LearnerOnboardingGate><SkunkieCompanion /></>;
    await render(page(true)); click("Use text only");
    expect(readSkunkiePreferences("account-a").showAvatar).toBe(false);
    await render(page(false));
    expect(host.querySelector(".skunkie--chat-only")).not.toBeNull();
    expect(host.querySelector(".skunkie-avatar")).toBeNull();
  });
  it("defaults to real avatar frames and keeps chat-only choice scoped to the account", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ available: true }))));
    await render(<SkunkieCompanion />); expect(host.querySelector(".skunkie-avatar")).not.toBeNull();
    click("Open Skunkie AI learning companion"); await act(async () => {});
    click("Hide avatar"); expect(host.querySelector(".skunkie-avatar")).toBeNull(); expect(readSkunkiePreferences("account-a").showAvatar).toBe(false);
    expect(readSkunkiePreferences("account-b").showAvatar).toBe(true);
    auth.accounts = [{ homeAccountId: "account-b" }]; await render(<SkunkieCompanion />);
    expect(host.querySelector(".skunkie-avatar")).not.toBeNull(); expect(host.querySelector("textarea")).toBeNull();
  });
  it("retains a failed question and never creates a fabricated server reply", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(url.endsWith("status") ? { available: true } : { error: "denied" }), { status: url.endsWith("status") ? 200 : 403 }))));
    await render(<SkunkieCompanion />); click("Open Skunkie AI learning companion"); await act(async () => {});
    enter("Keep this question"); await submit();
    expect(host.querySelector("textarea")?.value).toBe("Keep this question");
    expect(host.querySelector("[role=alert]")?.textContent).toMatch(/access/i);
    expect(host.querySelectorAll(".skunkie__message")).toHaveLength(1);
  });
  it("discards a late response after account swap and aborts its request", async () => {
    let resolveChat!: (response: Response) => void; let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((url: string, options: RequestInit) => url.endsWith("status") ? Promise.resolve(new Response('{"available":true}')) : new Promise<Response>(resolve => { resolveChat = resolve; signal = options.signal as AbortSignal; })));
    await render(<SkunkieCompanion />); click("Open Skunkie AI learning companion"); await act(async () => {}); enter("Private A question"); await submit();
    auth.accounts = [{ homeAccountId: "account-b" }]; await render(<SkunkieCompanion />); expect(signal?.aborted).toBe(true);
    await act(async () => resolveChat(new Response('{"reply":"Private A reply"}')));
    click("Open Skunkie AI learning companion"); await act(async () => {});
    expect(host.textContent).not.toContain("Private A"); expect(host.querySelector("textarea")?.value).toBe("");
  });
  it("retains new edits made while a successful reply is in flight", async () => {
    let resolveChat!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn((url: string) => url.endsWith("status") ? Promise.resolve(new Response('{"available":true}')) : new Promise<Response>(resolve => { resolveChat = resolve; })));
    await render(<SkunkieCompanion />); click("Open Skunkie AI learning companion"); await act(async () => {}); enter("First question"); await submit(); enter("Next question");
    await act(async () => resolveChat(new Response('{"reply":"Actual server answer"}')));
    expect(host.textContent).toContain("Actual server answer"); expect(host.querySelector("textarea")?.value).toBe("Next question");
  });
  it("scrolls instantly to the committed reply height, including with reduced motion", async () => {
    document.documentElement.dataset.portalMotion = "reduce";
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(new Response(JSON.stringify(url.endsWith("status") ? { available: true } : { reply: "A newly rendered answer" })))));
    await render(<SkunkieCompanion />); click("Open Skunkie AI learning companion"); await act(async () => {});
    const log = host.querySelector<HTMLElement>(".skunkie__messages")!;
    Object.defineProperty(log, "scrollHeight", { configurable: true, get: () => log.querySelectorAll(".skunkie__message").length * 120 });
    vi.mocked(Element.prototype.scrollTo).mockClear();
    enter("A new question"); await submit();
    expect(log.textContent).toContain("A newly rendered answer");
    expect(log.scrollTo).toHaveBeenLastCalledWith({ top: 360, behavior: "instant" });
  });
  it("stops all frame timers for reduced motion, hidden tabs and inactive avatars", async () => {
    vi.useFakeTimers(); await render(<SkunkieAvatar activity="speaking" />);
    const initial = host.querySelector<HTMLElement>(".skunkie-avatar__frame")!.style.backgroundPosition;
    await act(async () => vi.advanceTimersByTime(150)); expect(host.querySelector<HTMLElement>(".skunkie-avatar__frame")!.style.backgroundPosition).not.toBe(initial);
    await act(async () => { document.documentElement.dataset.portalMotion = "reduce"; }); expect(vi.getTimerCount()).toBe(0);
    expect(host.querySelector(".skunkie-avatar")?.getAttribute("data-animated")).toBe("false");
    await act(async () => { document.documentElement.dataset.portalMotion = "system"; }); expect(vi.getTimerCount()).toBe(1);
    Object.defineProperty(document, "hidden", { configurable: true, value: true }); await act(async () => document.dispatchEvent(new Event("visibilitychange"))); expect(vi.getTimerCount()).toBe(0);
    await render(<SkunkieAvatar active={false} />); expect(vi.getTimerCount()).toBe(0);
  });
  it("tolerates disabled preference storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw Error("blocked"); });
    expect(saveSkunkiePreferences("a", { showAvatar: false, readReplies: false })).toBe(false);
  });
});
