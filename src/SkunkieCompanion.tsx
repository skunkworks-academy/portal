import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import type { AccountInfo } from "@azure/msal-browser";
import { apiScope } from "./authConfig";
import { PortalApiError } from "./api-error";
import { learningErrorMessage } from "./learning-errors";
import { SkunkieAvatar } from "./SkunkieAvatar";
import { readSkunkiePreferences, saveSkunkiePreferences } from "./skunkie-preferences";
import { useSkunkieVoice } from "./useSkunkieVoice";
import "./skunkie-companion.css";

type ChatMessage = { role: "user" | "assistant"; content: string };
type MonthlyAllowance = { currency: "USD"; limitUsd: 1; remainingUsd: number; resetsAt: string; exhausted: boolean };
type StatusReason = "not_eligible" | "monthly_limit" | "budget_unavailable";
function monthlyAllowance(value: unknown): MonthlyAllowance | null {
  if (!value || typeof value !== "object") return null;
  const budget = value as Partial<MonthlyAllowance>;
  if (budget.currency !== "USD" || budget.limitUsd !== 1 || typeof budget.remainingUsd !== "number" ||
      !Number.isFinite(budget.remainingUsd) || budget.remainingUsd < 0 || budget.remainingUsd > budget.limitUsd ||
      typeof budget.exhausted !== "boolean" || typeof budget.resetsAt !== "string" || !Number.isFinite(Date.parse(budget.resetsAt))) return null;
  return budget as MonthlyAllowance;
}
function allowanceAmount(value: number) {
  return value > 0 && value < 0.01 ? "less than US$0.01" : `US$${value.toFixed(2)}`;
}
function allowanceReset(value: string) {
  return `${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value))} SAST`;
}
const greeting: ChatMessage = { role: "assistant", content: "Hi, I’m Skunkie. Ask me to explain a concept, quiz you, or help you work through a learning problem." };
const productionApiBaseUrl = "https://api.skunkworksacademy.com/api";
function apiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return ["localhost", "127.0.0.1"].includes(window.location.hostname) ? "/api" : productionApiBaseUrl;
}

export function SkunkieCompanion() {
  const { accounts } = useMsal();
  const [onboarding, setOnboarding] = useState(() => typeof document !== "undefined" && document.body.hasAttribute("data-portal-onboarding"));
  useEffect(() => {
    const update = (event: Event) => setOnboarding((event as CustomEvent<{ active: boolean }>).detail?.active === true);
    window.addEventListener("skunkworksacademy:onboarding-state", update);
    // App's child gate may publish before this sibling's effect subscribes.
    setOnboarding(document.body.hasAttribute("data-portal-onboarding"));
    return () => window.removeEventListener("skunkworksacademy:onboarding-state", update);
  }, []);
  const account = accounts[0];
  // Keying destroys all conversation/voice/request state before another account renders.
  return account ? <AccountSkunkie key={account.homeAccountId} account={account} suppressed={onboarding} /> : null;
}

function AccountSkunkie({ account, suppressed }: { account: AccountInfo; suppressed: boolean }) {
  const { instance } = useMsal();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [chatError, setChatError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [allowance, setAllowance] = useState<MonthlyAllowance | null>(null);
  const [allowanceStale, setAllowanceStale] = useState(false);
  const [statusReason, setStatusReason] = useState<StatusReason | null>(null);
  const [checkingAllowance, setCheckingAllowance] = useState(false);
  const [statusRequest, setStatusRequest] = useState(0);
  const [preferenceNotice, setPreferenceNotice] = useState("");
  const [preferences, setPreferences] = useState(() => readSkunkiePreferences(account.homeAccountId));
  const preferenceRef = useRef(preferences); preferenceRef.current = preferences;
  const [serviceState, setServiceState] = useState<"unknown" | "configured" | "ready" | "unavailable">("unknown");
  const [messages, setMessages] = useState<ChatMessage[]>([greeting]);
  const [wave, setWave] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const allowanceGeneration = useRef(0);
  const voice = useSkunkieVoice(account.homeAccountId, open && !suppressed, text => setInput(current => `${current}${current.trim() ? " " : ""}${text}`.slice(0, 4000)));
  const pageContext = useMemo(() => ({ title: document.title, path: window.location.pathname, heading: document.querySelector("h1")?.textContent?.trim() || undefined }), [open]);

  function cancelRequest() {
    if (requestRef.current) setAllowanceStale(true);
    generation.current++; requestRef.current?.abort(); requestRef.current = null; setBusy(false);
  }
  function close() { cancelRequest(); voice.stopAudio(); setOpen(false); launcherRef.current?.focus({ preventScroll: true }); }
  function changePreference(change: Partial<typeof preferences>) {
    const next = { ...preferences, ...change }; setPreferences(next);
    setPreferenceNotice(saveSkunkiePreferences(account.homeAccountId, next) ? "" : "This browser cannot remember the choice. It still applies for this session.");
    if (change.readReplies === false) voice.stopAudio();
  }
  useEffect(() => () => { generation.current++; requestRef.current?.abort(); }, []);
  useEffect(() => {
    if (suppressed) { cancelRequest(); setOpen(false); }
    else setPreferences(readSkunkiePreferences(account.homeAccountId));
  }, [suppressed, account.homeAccountId]);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus({ preventScroll: true }); setWave(true);
    const timer = window.setTimeout(() => setWave(false), 1200);
    function onEscape(event: KeyboardEvent) { if (event.key === "Escape") close(); }
    window.addEventListener("keydown", onEscape);
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", onEscape); };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || suppressed) return;
    // Measure after React commits the new reply; instant scrolling respects reduced motion.
    const log = logRef.current;
    log?.scrollTo({ top: log.scrollHeight, behavior: "instant" });
  }, [messages, open, suppressed]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const controller = new AbortController();
    const current = ++allowanceGeneration.current;
    setStatusError(""); setCheckingAllowance(true);
    void (async () => {
      try {
        const token = await instance.acquireTokenSilent({ account, scopes: [apiScope] });
        if (cancelled) return;
        const response = await fetch(`${apiBaseUrl()}/skunkie/status`, { headers: { Authorization: `Bearer ${token.accessToken}` }, signal: controller.signal });
        if (!response.ok) throw new PortalApiError(response.status, "Service status request failed");
        const result = await response.json() as { available?: boolean; budget?: unknown; reason?: StatusReason };
        if (cancelled || current !== allowanceGeneration.current) return;
        const budget = monthlyAllowance(result.budget);
        const reason = ["not_eligible", "monthly_limit", "budget_unavailable"].includes(result.reason || "") ? result.reason! : null;
        setStatusReason(reason);
        if (budget) { setAllowance(budget); setAllowanceStale(false); }
        else if (reason === "not_eligible") { setAllowance(null); setAllowanceStale(false); }
        else setAllowanceStale(true);
        setServiceState(result.available === true || (reason === "monthly_limit" && budget?.exhausted) ? "configured" : "unavailable");
        if (reason === "budget_unavailable") setStatusError("Your monthly AI allowance could not be checked. Try again later. Your question stays here.");
      } catch (error) {
        if (!cancelled && current === allowanceGeneration.current) {
          setServiceState("unknown"); setAllowanceStale(true); setStatusError(learningErrorMessage(error, "skunkie"));
        }
      } finally {
        if (!cancelled && current === allowanceGeneration.current) setCheckingAllowance(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [open, account.homeAccountId, instance, statusRequest]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy || allowance?.exhausted || statusReason === "not_eligible") return;
    // A delayed opening-status response must not replace the budget returned by this chat.
    allowanceGeneration.current++; setCheckingAllowance(false);
    voice.stopAudio(); setBusy(true); setChatError("");
    const current = ++generation.current;
    const controller = new AbortController(); requestRef.current = controller;
    const timeout = window.setTimeout(() => {
      if (current !== generation.current) return;
      controller.abort(); generation.current++; requestRef.current = null; setBusy(false);
      setAllowanceStale(true);
      setChatError("The learning service took too long to respond. Your question is still available to retry.");
    }, 30000);
    try {
      const token = await instance.acquireTokenSilent({ account, scopes: [apiScope] });
      if (current !== generation.current || controller.signal.aborted) return;
      const response = await fetch(`${apiBaseUrl()}/skunkie/chat`, {
        method: "POST", headers: { Authorization: `Bearer ${token.accessToken}`, "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ message, history: messages.slice(-8), context: pageContext })
      });
      if (current !== generation.current) return;
      const body = await response.json().catch(() => null) as { reply?: unknown; code?: unknown; budget?: unknown } | null;
      if (current !== generation.current) return;
      const budget = monthlyAllowance(body?.budget);
      if (!response.ok) {
        if (response.status === 429 && body?.code === "monthly_ai_limit" && budget?.exhausted) {
          setAllowance(budget); setAllowanceStale(false); setStatusReason("monthly_limit");
          setServiceState("configured"); setStatusError(""); return;
        }
        setAllowanceStale(true);
        setServiceState(response.status === 401 || response.status === 403 ? "unknown" : "unavailable");
        const reason = response.status === 404 ? "The Academy chat endpoint is unavailable. The service deployment needs attention." : learningErrorMessage(new PortalApiError(response.status, "Chat request failed"), "skunkie");
        setChatError(reason); return;
      }
      if (typeof body?.reply !== "string" || !body.reply.trim()) throw new Error("Empty learning service response");
      const reply = body.reply;
      if (budget) { setAllowance(budget); setAllowanceStale(false); }
      else setAllowanceStale(true);
      setStatusReason(null);
      setMessages(value => [...value, { role: "user", content: message }, { role: "assistant", content: reply }]);
      setInput(value => value.trim() === message ? "" : value);
      setServiceState("ready"); setStatusError("");
      if (preferenceRef.current.readReplies) voice.speak(reply);
    } catch (error) {
      if (current !== generation.current) return;
      setServiceState("unavailable"); setAllowanceStale(true);
      setChatError(error instanceof Error && error.name === "AbortError" ? "The learning service took too long to respond. Your question is still available to retry." : learningErrorMessage(error, "skunkie"));
    } finally {
      window.clearTimeout(timeout);
      if (current === generation.current) { requestRef.current = null; setBusy(false); }
    }
  }

  const activity = voice.listening ? "listening" : voice.speaking ? "speaking" : busy ? "thinking" : wave ? "wave" : "idle";
  if (suppressed) return null;
  return <aside className={`skunkie ${open ? "skunkie--open" : ""} ${preferences.showAvatar ? "" : "skunkie--chat-only"}`} aria-label="Skunkie AI learning companion">
    {open && <section id="skunkie-panel" className="skunkie__panel" role="dialog" aria-modal="false" aria-labelledby="skunkie-title">
      <header className="skunkie__header"><div><strong id="skunkie-title">Skunkie</strong><span>Learning companion</span></div>
        <button type="button" ref={closeRef} onClick={close} aria-label="Close Skunkie">×</button></header>
      <div className="skunkie__messages" ref={logRef} role="log" aria-live="polite" aria-relevant="additions text">
        {messages.map((item, index) => <div key={`${item.role}-${index}`} className={`skunkie__message skunkie__message--${item.role}`}>{item.content}</div>)}
        {busy && <p role="status">Thinking… <button type="button" onClick={cancelRequest}>Cancel response</button></p>}
      </div>
      {chatError && <div className="skunkie__error" role="alert"><p>{chatError}</p><button type="button" onClick={() => setChatError("")}>Dismiss</button></div>}
      {serviceState === "unavailable" && !chatError && !statusError && statusReason !== "not_eligible" && <p className="skunkie__service-notice" role="status">The learning service is currently unavailable. Your question will be retained if sending fails.</p>}
      {statusError && !chatError && <p className="skunkie__service-notice" role="status">{statusError}</p>}
      <div id="skunkie-allowance" className="skunkie__allowance" aria-label="Monthly AI allowance">
        <div role="status" aria-live="polite">
          {statusReason === "not_eligible" ? <p>Skunkie’s monthly AI allowance is available to Student accounts. This account is not eligible.</p> : allowance ? <>
            <p><strong>{allowanceStale ? "Last confirmed allowance" : "Monthly AI allowance"}:</strong> {allowanceAmount(allowance.remainingUsd)} of US$1.00 available.</p>
            <p>Available allowance excludes pending reply reservations. Resets <time dateTime={allowance.resetsAt}>{allowanceReset(allowance.resetsAt)}</time>.</p>
            {allowance.exhausted && <p>You cannot start another reply under this month’s allowance. You can keep editing your question.</p>}
          </> : <p>Monthly AI allowance: {checkingAllowance ? "checking…" : "not currently available."}</p>}
        </div>
        <button type="button" disabled={busy || checkingAllowance} onClick={() => setStatusRequest(value => value + 1)}>{checkingAllowance ? "Checking allowance…" : "Check allowance"}</button>
      </div>
      <p id="skunkie-processing" className="skunkie__notice">When you send, Azure AI processes your message, recent chat history and page context globally. Microphone input is a separate browser feature.</p>
      <div className="skunkie__quick-actions" aria-label="Suggested prompts">{["Explain this page", "Quiz me", "Give me a hint"].map(prompt => <button key={prompt} type="button" onClick={() => setInput(prompt)}>{prompt}</button>)}</div>
      <form className="skunkie__form" onSubmit={event => void send(event)}><label htmlFor="skunkie-input" className="sr-only">Ask Skunkie</label>
        <textarea id="skunkie-input" value={input} onChange={event => setInput(event.target.value)} aria-describedby="skunkie-allowance skunkie-processing" maxLength={4000} rows={2} placeholder="Ask Skunkie…" />
        <button type="submit" disabled={busy || !input.trim() || allowance?.exhausted || statusReason === "not_eligible"}>Send</button></form>
      <div className="skunkie__voice-controls">
        {voice.canListen ? <button type="button" onClick={voice.starting || voice.listening ? voice.stopListening : voice.startListening} disabled={busy}>{voice.starting ? "Cancel microphone startup" : voice.listening ? "Stop microphone" : "Use microphone"}</button> : <span>{voice.unavailableReason}</span>}
        {voice.canSpeak && <label><input type="checkbox" checked={preferences.readReplies} onChange={event => changePreference({ readReplies: event.target.checked })} /> Read replies aloud</label>}
        {voice.speaking && <button type="button" onClick={voice.stopAudio}>Stop reading</button>}
      </div>
      {voice.starting && <p role="status" className="skunkie__notice">Starting microphone… Check your browser for a permission prompt. You can cancel while it starts.</p>}
      <p className="skunkie__notice">{voice.listening ? "Listening. Your words fill the message box; review them before sending. " : ""}Voice is provided by your browser and may use its online speech service. The microphone starts only when you choose it.</p>
      {(voice.notice || preferenceNotice) && <p role="status" className="skunkie__notice">{voice.notice || preferenceNotice}</p>}
      <div className="skunkie__preferences"><button type="button" onClick={() => changePreference({ showAvatar: !preferences.showAvatar })}>{preferences.showAvatar ? "Hide avatar · chat only" : "Show Skunkie avatar"}</button><small>AI can make mistakes. Verify important information.</small></div>
    </section>}
    <button type="button" className="skunkie__launcher" ref={launcherRef} onClick={() => open ? close() : setOpen(true)} aria-expanded={open} aria-controls="skunkie-panel" aria-label={open ? "Close Skunkie AI learning companion" : "Open Skunkie AI learning companion"}>
      {preferences.showAvatar && <SkunkieAvatar activity={activity} />}
      <span className={`skunkie__status skunkie__status--${serviceState}`} aria-hidden="true" />
      <span className="skunkie__label">{voice.listening ? "Listening…" : voice.speaking ? "Speaking…" : busy ? "Thinking…" : open ? "Skunkie" : "Ask Skunkie"}</span>
    </button>
  </aside>;
}
