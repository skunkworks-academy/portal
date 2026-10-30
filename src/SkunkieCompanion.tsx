import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { apiScope } from "./authConfig";
import { SKUNKIE_AVATAR_SRC } from "./skunkie-assets";
import "./skunkie-companion.css";

type ChatMessage = { role: "user" | "assistant"; content: string };
type SkunkieResponse = { reply: string };

const productionApiBaseUrl = "https://api.skunkworksacademy.com/api";
const localApiBaseUrl = "http://localhost:8080/api";

function apiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? localApiBaseUrl
    : productionApiBaseUrl;
}

export function SkunkieCompanion() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  const [chatError, setChatError] = useState("");
  const [serviceState, setServiceState] = useState<"unknown" | "ready" | "unavailable">("unknown");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi, I’m Skunkie. Ask me to explain a concept, quiz you, or help you work through a learning problem." }
  ]);
  const logRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);

  const pageContext = useMemo(() => ({
    title: document.title,
    path: window.location.pathname,
    heading: document.querySelector("h1")?.textContent?.trim() || undefined
  }), [open]);

  useEffect(() => {
    if (open) closeRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        launcherRef.current?.focus({ preventScroll: true });
      }
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open]);

  // Check readiness without sending a fake learner message. A reachable API
  // is not proof that the Azure OpenAI deployment has been provisioned.
  useEffect(() => {
    if (!open || !account) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      try {
        const token = await instance.acquireTokenSilent({ account, scopes: [apiScope] });
        const response = await fetch(`${apiBaseUrl()}/skunkie/status`, {
          headers: { Authorization: `Bearer ${token.accessToken}` },
          signal: controller.signal
        });
        if (!response.ok) throw new Error("Service status unavailable");
        const result = await response.json() as { available?: boolean };
        if (!cancelled) setServiceState(result.available ? "ready" : "unavailable");
      } catch {
        if (!cancelled) setServiceState("unknown");
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [open, account?.homeAccountId, instance]);

  if (!account) return null;

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;

    setBusy(true);
    setChatError("");
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 30000);
    try {
      const token = await instance.acquireTokenSilent({ account, scopes: [apiScope] });
      const response = await fetch(`${apiBaseUrl()}/skunkie/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal,
        body: JSON.stringify({
          message,
          // The latest prompt is supplied separately by the API. Do not add it
          // to history too, or the model receives the same message twice.
          history: messages.slice(-8),
          context: pageContext
        })
      });

      if (!response.ok) {
        setServiceState("unavailable");
        const reason = response.status === 404
          ? "The Academy chat endpoint is unavailable. The service deployment needs attention."
          : response.status === 401 || response.status === 403
            ? "Your Microsoft session is not authorised for Skunkie. Sign out and sign in again."
            : response.status === 503
              ? "Skunkie is not ready on the Academy server. An administrator needs to check its Azure AI configuration."
              : response.status === 429
                ? "Skunkie is receiving too many requests. Try again shortly."
                : "The Academy learning service could not respond. Try again shortly.";
        setChatError(reason);
        return;
      }

      const body = await response.json() as SkunkieResponse;
      if (!body.reply || typeof body.reply !== "string") throw new Error("Empty learning service response");
      setMessages(current => [
        ...current,
        { role: "user", content: message },
        { role: "assistant", content: body.reply }
      ]);
      setInput("");
      setServiceState("ready");
      requestAnimationFrame(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }));
    } catch (error) {
      setServiceState("unavailable");
      setChatError(error instanceof Error && error.name === "AbortError"
        ? "The learning service took too long to respond. Your question is still available to retry."
        : "Skunkie could not connect. Check your connection and Microsoft session, then retry.");
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  return (
    <aside className={`skunkie ${open ? "skunkie--open" : ""}`} aria-label="Skunkie AI learning companion">
      {open && (
        <section id="skunkie-panel" className="skunkie__panel" role="dialog" aria-modal="false" aria-labelledby="skunkie-title">
          <header className="skunkie__header">
            <div className="skunkie__identity">
              <img className="skunkie__header-avatar" src={SKUNKIE_AVATAR_SRC} alt="" width="44" height="44" />
              <div>
                <strong id="skunkie-title">Skunkie</strong>
                <span>AI learning companion</span>
              </div>
            </div>
            <button type="button" ref={closeRef} className="skunkie__close" onClick={() => { setOpen(false); launcherRef.current?.focus({ preventScroll: true }); }} aria-label="Close Skunkie">×</button>
          </header>

          <div className="skunkie__messages" ref={logRef} role="log" aria-live="polite">
            {messages.map((item, index) => (
              <div key={`${item.role}-${index}`} className={`skunkie__message skunkie__message--${item.role}`}>
                {item.content}
              </div>
            ))}
            {busy && <div className="skunkie__message skunkie__message--assistant skunkie__thinking">Thinking…</div>}
          </div>

          {chatError && <div className="skunkie__error" role="alert"><strong>Skunkie needs attention</strong><p>{chatError}</p><button type="button" onClick={() => setChatError("")}>Dismiss</button></div>}
          {serviceState === "unavailable" && !chatError && <p className="skunkie__service-notice" role="status">The learning service is currently unavailable. Your question will be retained if sending fails.</p>}
          <div className="skunkie__quick-actions" aria-label="Suggested prompts">
            {["Explain this page", "Quiz me", "Give me a hint"].map((prompt) => (
              <button key={prompt} type="button" onClick={() => setInput(prompt)}>{prompt}</button>
            ))}
          </div>

          <form className="skunkie__form" onSubmit={send}>
            <label htmlFor="skunkie-input" className="sr-only">Ask Skunkie</label>
            <textarea
              id="skunkie-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={4000}
              rows={2}
              placeholder="Ask Skunkie…"
              disabled={busy}
            />
            <button type="submit" disabled={busy || !input.trim()}>Send</button>
          </form>
          <p className="skunkie__notice">AI can make mistakes. Verify critical technical, exam and policy information.</p>
        </section>
      )}

      <button
        type="button"
        className="skunkie__launcher"
        ref={launcherRef}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="skunkie-panel"
        aria-label={open ? "Close Skunkie AI learning companion" : "Open Skunkie AI learning companion"}
      >
        {!imageFailed ? (
          <img
            src={SKUNKIE_AVATAR_SRC}
            alt=""
            width="92"
            height="92"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="skunkie__fallback" aria-hidden="true">S</span>
        )}
        <span className={`skunkie__status skunkie__status--${serviceState}`} aria-hidden="true" />
        <span className="skunkie__label">Ask Skunkie</span>
      </button>
    </aside>
  );
}
