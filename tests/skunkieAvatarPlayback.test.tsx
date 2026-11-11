// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkunkieAvatar, skunkieSequences, SKUNKIE_MOTION_SRC } from "../src/SkunkieAvatar";

let host: HTMLDivElement;
let root: Root;
let probes: Probe[];
class Probe {
  onload: (() => void) | null = null;
  src = "";
  decode = vi.fn(() => Promise.resolve());
  constructor() { probes.push(this); }
}
async function render(activity: keyof typeof skunkieSequences = "idle", reduceMotion = false) {
  await act(async () => root.render(<SkunkieAvatar activity={activity} reduceMotion={reduceMotion} />));
}
async function load() { await act(async () => { probes[0].onload?.(); }); }
function frame() { return host.querySelector<HTMLElement>(".skunkie-avatar__frame"); }

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  probes = [];
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
    expect(frame()?.style.backgroundImage).toContain(SKUNKIE_MOTION_SRC);
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
  it("plays all 48 populated frame indices without requesting another sheet on activity changes", async () => {
    await render(); await load();
    const seen = new Set<number>();
    for (const activity of Object.keys(skunkieSequences) as (keyof typeof skunkieSequences)[]) {
      await render(activity);
      for (let step = 0; step < skunkieSequences[activity].frames.length; step++) {
        seen.add(Number(frame()!.dataset.frame));
        expect(frame()!.style.backgroundImage).toContain(SKUNKIE_MOTION_SRC);
        await act(async () => vi.advanceTimersByTime(skunkieSequences[activity].ms));
      }
    }
    expect([...seen].sort((a,b) => a-b)).toEqual(Array.from({length:48}, (_,i) => i));
    expect(probes).toHaveLength(1);
  });
  it("uses the populated neutral frame without timers for reduced motion", async () => {
    await render("speaking", true); await load();
    expect(frame()?.dataset.frame).toBe("0");
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
});
