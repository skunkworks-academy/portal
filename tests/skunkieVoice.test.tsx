// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSkunkieVoice } from "../src/useSkunkieVoice";
class Recognition {
  static instances: Recognition[] = [];
  onstart: (() => void) | null = null; onend: (() => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onresult: ((e: { resultIndex: number; results: Array<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null = null;
  start = vi.fn(() => this.onstart?.()); stop = vi.fn(() => this.onend?.()); abort = vi.fn();
  constructor() { Recognition.instances.push(this); }
}
let host: HTMLDivElement; let root: Root; const transcript = vi.fn();
function Harness({ scope = "a", active = true }: { scope?: string; active?: boolean }) {
  const voice = useSkunkieVoice(scope, active, transcript);
  return <><button onClick={voice.startListening}>Start</button><button onClick={voice.stopListening}>Stop</button><p>{voice.listening ? "Listening" : "Stopped"}</p><p role="status">{voice.notice}</p></>;
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: Recognition });
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  Recognition.instances = []; transcript.mockReset(); host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); Reflect.deleteProperty(window, "SpeechRecognition"); });
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
});
