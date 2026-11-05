// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSkunkieVoice, voiceStartupTimeoutMs } from "../src/useSkunkieVoice";
class Recognition {
  static instances: Recognition[] = [];
  static autoStart = true;
  static startError: Error | null = null;
  lang = "";
  onstart: (() => void) | null = null; onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onresult: ((e: { resultIndex: number; results: Array<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
  start = vi.fn(() => { if (Recognition.startError) throw Recognition.startError; if (Recognition.autoStart) this.onstart?.(); }); stop = vi.fn(() => this.onend?.()); abort = vi.fn();
  constructor() { Recognition.instances.push(this); }
}
let host: HTMLDivElement; let root: Root; const transcript = vi.fn();
function Harness({ scope = "a", active = true }: { scope?: string; active?: boolean }) {
  const voice = useSkunkieVoice(scope, active, transcript);
  return <><button disabled={!voice.canListen} onClick={voice.startListening}>Start</button><button onClick={voice.stopListening}>Stop</button><p>{voice.starting ? "Starting" : voice.listening ? "Listening" : "Stopped"}</p><p role="status">{voice.notice || voice.unavailableReason}</p></>;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: Recognition });
  Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  Recognition.instances = []; Recognition.autoStart = true; Recognition.startError = null; transcript.mockReset(); host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); Reflect.deleteProperty(window, "SpeechRecognition"); Reflect.deleteProperty(document, "permissionsPolicy"); document.documentElement.removeAttribute("lang"); vi.useRealTimers(); vi.restoreAllMocks(); });
describe("explicit browser voice", () => {
  it("never starts automatically, dictates only final words and stops on account change", async () => {
    await act(async () => root.render(<Harness />)); expect(Recognition.instances).toHaveLength(0);
    act(() => host.querySelector("button")!.click()); const session = Recognition.instances[0]; expect(session.start).toHaveBeenCalledTimes(1);
    act(() => session.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "My own words" } }] })); expect(transcript).toHaveBeenCalledWith("My own words");
    await act(async () => root.render(<Harness scope="b" />)); expect(session.abort).toHaveBeenCalled();
    act(() => session.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "Late private words" } }] })); expect(transcript).not.toHaveBeenCalledWith("Late private words");
  });
  it("reports denied permission and aborts when the tab becomes hidden", async () => {
    await act(async () => root.render(<Harness />)); act(() => host.querySelector("button")!.click());
    act(() => Recognition.instances[0].onerror?.({ error: "not-allowed" })); expect(host.textContent).toContain("permission was not granted");
    Object.defineProperty(document, "hidden", { configurable: true, value: true }); act(() => document.dispatchEvent(new Event("visibilitychange"))); expect(Recognition.instances[0].abort).toHaveBeenCalled();
  });
  it("shows starting immediately, prevents overlapping starts, and times out a silent browser", async () => {
    vi.useFakeTimers(); Recognition.autoStart = false;
    await act(async () => root.render(<Harness />));
    act(() => { host.querySelector("button")!.click(); host.querySelector("button")!.click(); });
    expect(host.textContent).toContain("Starting"); expect(host.textContent).not.toContain("Listening"); expect(Recognition.instances).toHaveLength(1);
    const session = Recognition.instances[0]; const lateStart = session.onstart; const lateResult = session.onresult;
    act(() => vi.advanceTimersByTime(voiceStartupTimeoutMs));
    expect(host.textContent).toContain("browser did not start voice input"); expect(session.abort).toHaveBeenCalledTimes(1);
    act(() => { lateStart?.(); lateResult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "Too late" } }] }); });
    expect(host.textContent).not.toContain("Listening"); expect(transcript).not.toHaveBeenCalled();
    act(() => host.querySelector("button")!.click()); expect(Recognition.instances).toHaveLength(2);
  });
  it("cancels pending startup, clears its timer, and ignores late private words", async () => {
    vi.useFakeTimers(); Recognition.autoStart = false;
    await act(async () => root.render(<Harness />)); act(() => host.querySelector("button")!.click());
    const session = Recognition.instances[0]; const lateResult = session.onresult;
    act(() => host.querySelectorAll("button")[1].click());
    expect(session.abort).toHaveBeenCalledTimes(1); expect(host.textContent).toContain("cancelled");
    act(() => { vi.advanceTimersByTime(voiceStartupTimeoutMs); lateResult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "Cancelled" } }] }); });
    expect(host.textContent).not.toContain("did not start"); expect(transcript).not.toHaveBeenCalled();
  });
  it.each([
    ["not-allowed", "permission was not granted"], ["audio-capture", "could not capture microphone audio"],
    ["network", "speech service could not connect"], ["service-not-allowed", "unavailable or blocked"],
    ["language-not-supported", "does not support the selected language"], ["no-speech", "No speech was detected"],
    ["aborted", "cancelled"], ["unexpected-error", "could not continue"]
  ])("explains %s and releases the failed session", async (error, message) => {
    await act(async () => root.render(<Harness />)); act(() => host.querySelector("button")!.click());
    const session = Recognition.instances[0]; const lateEnd = session.onend;
    act(() => session.onerror?.({ error })); act(() => lateEnd?.());
    expect(host.textContent).toContain(message); expect(host.textContent).not.toContain("Listening"); expect(session.abort).toHaveBeenCalled();
    expect(transcript).not.toHaveBeenCalled();
  });
  it("reports a synchronous permission failure without leaving a session or timer", async () => {
    vi.useFakeTimers(); Recognition.startError = new DOMException("denied", "NotAllowedError");
    await act(async () => root.render(<Harness />)); act(() => host.querySelector("button")!.click());
    expect(host.textContent).toContain("permission was not granted"); expect(host.textContent).not.toContain("Starting");
    act(() => vi.advanceTimersByTime(voiceStartupTimeoutMs)); expect(host.textContent).not.toContain("did not start");
    Recognition.startError = null; act(() => host.querySelector("button")!.click()); expect(host.textContent).toContain("Listening");
  });
  it("clears the startup deadline once listening and delivers final words when stopped", async () => {
    vi.useFakeTimers(); await act(async () => root.render(<Harness />)); act(() => host.querySelector("button")!.click());
    act(() => vi.advanceTimersByTime(voiceStartupTimeoutMs)); expect(host.textContent).toContain("Listening");
    const session = Recognition.instances[0]; session.stop.mockImplementation(() => { session.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "Final words" } }] }); session.onend?.(); });
    act(() => host.querySelectorAll("button")[1].click()); expect(transcript).toHaveBeenCalledExactlyOnceWith("Final words"); expect(host.textContent).toContain("Stopped");
  });
  it("releases pending startup when inactive and blocks stale callbacks", async () => {
    vi.useFakeTimers(); Recognition.autoStart = false;
    await act(async () => root.render(<Harness />)); act(() => host.querySelector("button")!.click());
    const session = Recognition.instances[0]; const lateStart = session.onstart;
    await act(async () => root.render(<Harness active={false} />));
    act(() => { lateStart?.(); vi.advanceTimersByTime(voiceStartupTimeoutMs); });
    expect(session.abort).toHaveBeenCalled(); expect(host.textContent).toContain("Stopped"); expect(host.textContent).not.toContain("did not start");
    act(() => host.querySelector("button")!.click()); expect(Recognition.instances).toHaveLength(1);
  });
  it.each(["insecure", "policy", "missing API"])("does not offer voice when %s is known to block it", async reason => {
    if (reason === "insecure") Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });
    if (reason === "policy") Object.defineProperty(document, "permissionsPolicy", { configurable: true, value: { allowsFeature: () => false } });
    if (reason === "missing API") Reflect.deleteProperty(window, "SpeechRecognition");
    await act(async () => root.render(<Harness />)); expect(host.querySelector("button")!.disabled).toBe(true); expect(host.querySelector('[role="status"]')!.textContent).toMatch(/secure|blocked|unavailable/);
    expect(Recognition.instances).toHaveLength(0);
  });
  it("uses a concrete English locale for bare en and preserves explicit page locales", async () => {
    document.documentElement.lang = "en"; vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-ZA", "en-US"]);
    await act(async () => root.render(<Harness />)); act(() => host.querySelector("button")!.click()); expect(Recognition.instances[0].lang).toBe("en-ZA");
    act(() => host.querySelectorAll("button")[1].click()); document.documentElement.lang = "de-DE";
    act(() => host.querySelector("button")!.click()); expect(Recognition.instances[1].lang).toBe("de-DE");
  });
});
