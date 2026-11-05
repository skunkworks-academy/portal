import { useCallback, useEffect, useRef, useState } from "react";

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onstart: (() => void) | null; onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  start(): void; stop(): void; abort(): void;
};
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
type VoiceDocument = Document & { permissionsPolicy?: { allowsFeature(feature: string): boolean } };

export const voiceStartupTimeoutMs = 12_000;

function recognitionLanguage() {
  const language = document.documentElement.lang.trim() || navigator.language || "en-US";
  // A page's broad English tag does not select a recognition dialect. Prefer the
  // browser's English locale; support still depends on its recognition service.
  if (language.toLowerCase() === "en") return navigator.languages.find(value => /^en-/i.test(value)) || "en-US";
  return language;
}

function recognitionError(code: string) {
  switch (code) {
    case "not-allowed": return "Microphone permission was not granted. Check this site's microphone permission and your device privacy settings, then try again. You can still type your message.";
    case "audio-capture": return "The browser could not capture microphone audio. Check that a microphone is connected and available, then try again. You can still type your message.";
    case "network": return "The browser's speech service could not connect. Check your connection or try again later. You can still type your message.";
    case "service-not-allowed": return "This browser's speech service is unavailable or blocked by its settings. You can type your message or use a browser with speech recognition enabled.";
    case "language-not-supported": return "This browser's speech service does not support the selected language. You can still type your message.";
    case "no-speech": return "No speech was detected. Try again when you are ready, or type your message.";
    case "aborted": return "Voice input was cancelled. Your message is still here.";
    default: return "Voice input could not continue. Please try again or type your message.";
  }
}

/** Browser voice input and read-aloud. Never starts a microphone or sends a draft automatically. */
export function useSkunkieVoice(scope: string, active: boolean, onTranscript: (text: string) => void) {
  const [starting, setStarting] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const stopSession = useRef<(() => void) | null>(null);
  const deadline = useRef<ReturnType<typeof setTimeout> | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const generation = useRef(0);
  const callback = useRef(onTranscript); callback.current = onTranscript;
  const constructor = (window as VoiceWindow).SpeechRecognition ?? (window as VoiceWindow).webkitSpeechRecognition;
  const unavailableReason = window.isSecureContext === false
    ? "Voice input needs a secure page. Open the portal over HTTPS, or type your message."
    : (document as VoiceDocument).permissionsPolicy?.allowsFeature("microphone") === false
      ? "Microphone access is blocked for this page. You can still type your message."
      : typeof constructor !== "function" ? "Voice input is unavailable in this browser. You can still type your message." : "";
  const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const stopAudio = useCallback(() => {
    generation.current++;
    if (deadline.current !== null) { clearTimeout(deadline.current); deadline.current = null; }
    const session = recognition.current; recognition.current = null;
    stopSession.current = null;
    if (session) {
      session.onstart = null; session.onend = null; session.onerror = null; session.onresult = null;
      try { session.abort(); } catch { /* Some browsers throw after the session has already ended. */ }
    }
    if (utterance.current) { window.speechSynthesis.cancel(); utterance.current = null; }
    setStarting(false); setListening(false); setSpeaking(false);
  }, []);
  useEffect(() => {
    stopAudio(); setNotice("");
    const onHidden = () => { if (document.hidden) stopAudio(); };
    document.addEventListener("visibilitychange", onHidden);
    return () => { document.removeEventListener("visibilitychange", onHidden); stopAudio(); };
  }, [scope, active, stopAudio]);
  function startListening() {
    if (!active || document.hidden || recognition.current) return;
    if (unavailableReason || !constructor) { setNotice(unavailableReason); return; }
    stopAudio(); setNotice("");
    const current = generation.current;
    let session: Recognition;
    try { session = new constructor(); } catch { setNotice("This browser could not initialise speech recognition. You can still type your message."); return; }
    recognition.current = session;
    session.lang = recognitionLanguage();
    session.continuous = false; session.interimResults = false;
    let started = false; let receivedText = false; let stopping = false;
    const clearDeadline = () => { if (deadline.current !== null) { clearTimeout(deadline.current); deadline.current = null; } };
    const finish = (message = "") => {
      if (current !== generation.current) return;
      stopAudio(); if (message) setNotice(message);
    };
    session.onstart = () => {
      if (current !== generation.current || stopping) return;
      started = true; clearDeadline(); setStarting(false); setListening(true);
    };
    session.onend = () => finish(!started && !stopping
      ? "The browser ended voice input before the microphone started. Please try again or type your message."
      : !receivedText && !stopping ? recognitionError("no-speech") : "");
    session.onerror = event => {
      finish(recognitionError(event.error));
    };
    session.onresult = event => {
      if (current !== generation.current) return;
      const text = Array.from(event.results).slice(event.resultIndex).filter(result => result.isFinal).map(result => result[0].transcript).join(" ").trim();
      if (text) { receivedText = true; callback.current(text); }
    };
    setStarting(true);
    deadline.current = setTimeout(() => finish("The browser did not start voice input. Check for a microphone permission prompt or a blocked speech service, then try again. You can still type your message."), voiceStartupTimeoutMs);
    try { session.start(); } catch (error) {
      const name = error && typeof error === "object" && "name" in error ? error.name : "";
      finish(name === "NotAllowedError" || name === "SecurityError" ? recognitionError("not-allowed") : "Voice input could not start. Please try again or type your message.");
    }
    // stop() may deliver a final result before onend; bound that wait as well.
    stopSession.current = () => {
      if (current !== generation.current) return;
      if (!started || stopping) { finish(recognitionError("aborted")); return; }
      stopping = true; clearDeadline();
      deadline.current = setTimeout(() => finish(), 5_000);
      try { session.stop(); } catch { finish(); }
    };
  }
  function stopListening() { stopSession.current?.(); }
  function speak(text: string) {
    if (!active || !canSpeak || document.hidden || !text.trim()) return;
    stopAudio();
    const current = generation.current;
    const speech = new SpeechSynthesisUtterance(text);
    utterance.current = speech;
    speech.onstart = () => { if (current === generation.current) setSpeaking(true); };
    const finish = () => { if (current === generation.current) { setSpeaking(false); utterance.current = null; } };
    speech.onend = finish; speech.onerror = finish;
    window.speechSynthesis.speak(speech);
  }
  return { starting, listening, speaking, notice, unavailableReason, canListen: !unavailableReason, canSpeak, startListening, stopListening, speak, stopAudio };
}
