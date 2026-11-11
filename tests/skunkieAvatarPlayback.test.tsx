// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkunkieAvatar, skunkieSequences, SKUNKIE_MOTION_SRC } from "../src/SkunkieAvatar";
const painter = vi.hoisted(() => ({ draw: vi.fn(), dispose: vi.fn() }));
const rendering = vi.hoisted(() => ({ available: true }));
vi.mock("../src/skunkie-motion-renderer", async importOriginal => ({
  ...await importOriginal<typeof import("../src/skunkie-motion-renderer")>(),
  createSkunkieRenderer: vi.fn(() => rendering.available ? painter : null)
}));

let host: HTMLDivElement;
let root: Root;
let probes: Probe[];
class Probe {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = "";
  decode = vi.fn(() => Promise.resolve());
  constructor() { probes.push(this); }
}
async function render(activity: keyof typeof skunkieSequences = "idle", reduceMotion = false) {
  await act(async () => root.render(<SkunkieAvatar activity={activity} reduceMotion={reduceMotion} />));
}
async function load() { await act(async () => { probes.forEach(probe => probe.onload?.()); }); }
function frame() { return host.querySelector<HTMLCanvasElement>(".skunkie-avatar__canvas:not([hidden])"); }

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  probes = [];
  rendering.available = true; painter.draw.mockClear(); painter.dispose.mockClear();
  vi.stubGlobal("Image", Probe);
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }) });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  document.documentElement.removeAttribute("data-portal-motion");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  vi.useFakeTimers();
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Skunkie frame availability", () => {
  it("keeps a still visible until the atlas has loaded and decoded", async () => {
    await render();
    expect(host.querySelector("img")).not.toBeNull();
    expect(frame()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    let finish!: () => void;
    probes[0].decode.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    await load();
    expect(host.querySelector("img")).not.toBeNull();
    await act(async () => finish());
    expect(frame()).not.toBeNull();
    expect(probes[0].src).toBe(SKUNKIE_MOTION_SRC);
    expect(vi.getTimerCount()).toBe(1);
  });
  it("retains a still on network/decode failure and shows a visible final fallback if that fails too", async () => {
    await render("speaking");
    // No load event models an unavailable atlas.
    await act(async () => vi.advanceTimersByTime(10000));
    expect(host.querySelector("img")).not.toBeNull();
    probes[0].decode.mockRejectedValueOnce(new Error("bad image"));
    await load();
    expect(frame()).toBeNull();
    act(() => host.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(host.querySelector(".skunkie-avatar__placeholder")?.textContent).toBe("S");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("draws intermediate movement every refresh without reloading on activity changes", async () => {
    await render(); await load();
    await act(async () => vi.advanceTimersByTime(160));
    expect(painter.draw.mock.calls.length).toBeGreaterThanOrEqual(9);
    const before = painter.draw.mock.calls.at(-1)![0];
    expect(before.progress).toBeGreaterThan(0); expect(before.progress).toBeLessThan(1);
    await render("speaking");
    expect(painter.draw.mock.calls.at(-1)![0]).toEqual(before);
    await act(async () => vi.advanceTimersByTime(16));
    expect(painter.draw.mock.calls.at(-1)![0].progress).toBeGreaterThan(before.progress);
    expect(probes).toHaveLength(2);
  });
  it("uses the populated neutral frame without timers for reduced motion", async () => {
    await render("speaking", true); await load();
    expect(frame()).toBeNull(); expect(host.querySelector("img")).not.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(host.querySelector(".skunkie-avatar")?.getAttribute("data-animated")).toBe("false");
  });
  it("ignores a late decode after unmount", async () => {
    await render();
    let finish!: () => void;
    probes[0].decode.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    await load();
    await act(async () => root.render(null));
    await act(async () => finish());
    expect(host.innerHTML).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("retains the still when GPU rendering is unavailable", async () => {
    rendering.available = false; await render(); await load();
    expect(frame()).toBeNull(); expect(host.querySelector("img")).not.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("stops drawing and restores the still when the GPU context is lost", async () => {
    await render(); await load();
    act(() => frame()!.dispatchEvent(new Event("webglcontextlost", {cancelable:true})));
    expect(painter.dispose).toHaveBeenCalled();
    expect(frame()).toBeNull(); expect(host.querySelector("img")).not.toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
