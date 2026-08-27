import { FormEvent, useMemo, useRef, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { apiScope } from "./authConfig";
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
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "assistant", content: "Hi, I’m Skunkie. Ask me to explain a concept, quiz you, or help you work through a learning problem." }
  ]);
  const logRef = useRef<HTMLDivElement>(null);

  const pageContext = useMemo(() => ({
    title: document.title,
    path: window.location.pathname,
    heading: document.querySelector("h1")?.textContent?.trim() || undefined
  }), [open]);

  if (!account) return null;

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;

    const nextMessages = [...messages, { role: "user" as const, content: message }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);

    try {
      const token = await instance.acquireTokenSilent({ account, scopes: [apiScope] });
      const response = await fetch(`${apiBaseUrl()}/skunkie/chat`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          message,
          history: nextMessages.slice(-8),
          context: pageContext
        })
      });

      if (!response.ok) throw new Error(await response.text() || `Skunkie request failed (${response.status})`);
      const body = await response.json() as SkunkieResponse;
      setMessages((current) => [...current, { role: "assistant", content: body.reply }]);
    } catch (error) {
      console.error("Skunkie request failed", error);
      setMessages((current) => [...current, {
        role: "assistant",
        content: "I can’t reach the learning service right now. Please try again shortly."
      }]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }));
    }
  }

  return (
    <aside className={`skunkie ${open ? "skunkie--open" : ""}`} aria-label="Skunkie AI learning companion">
      {open && (
        <section className="skunkie__panel" role="dialog" aria-modal="false" aria-labelledby="skunkie-title">
          <header className="skunkie__header">
            <div>
              <strong id="skunkie-title">Skunkie</strong>
              <span>AI learning companion</span>
            </div>
            <button type="button" className="skunkie__close" onClick={() => setOpen(false)} aria-label="Close Skunkie">×</button>
          </header>

          <div className="skunkie__messages" ref={logRef} role="log" aria-live="polite">
            {messages.map((item, index) => (
              <div key={`${item.role}-${index}`} className={`skunkie__message skunkie__message--${item.role}`}>
                {item.content}
              </div>
            ))}
            {busy && <div className="skunkie__message skunkie__message--assistant skunkie__thinking">Thinking…</div>}
          </div>

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
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="skunkie-panel"
        aria-label={open ? "Close Skunkie AI learning companion" : "Open Skunkie AI learning companion"}
      >
        {!imageFailed ? (
          <img
            src="/assets/skunkie/skunkie-learning-companion.png"
            alt=""
            width="92"
            height="92"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <span className="skunkie__fallback" aria-hidden="true">S</span>
        )}
        <span className="skunkie__status" aria-hidden="true" />
        <span className="skunkie__label">Ask Skunkie</span>
      </button>
    </aside>
  );
}
