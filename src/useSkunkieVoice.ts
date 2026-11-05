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

/** Browser voice input and read-aloud. Never starts a microphone or sends a draft automatically. */
export function useSkunkieVoice(scope: string, active: boolean, onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const generation = useRef(0);
  const callback = useRef(onTranscript); callback.current = onTranscript;
  const constructor = (window as VoiceWindow).SpeechRecognition ?? (window as VoiceWindow).webkitSpeechRecognition;
  const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const stopAudio = useCallback(() => {
    generation.current++;
    recognition.current?.abort(); recognition.current = null;
    if (utterance.current) { window.speechSynthesis.cancel(); utterance.current = null; }
    setListening(false); setSpeaking(false);
  }, []);
  useEffect(() => {
    stopAudio(); setNotice("");
    const onHidden = () => { if (document.hidden) stopAudio(); };
    document.addEventListener("visibilitychange", onHidden);
    return () => { document.removeEventListener("visibilitychange", onHidden); stopAudio(); };
  }, [scope, active, stopAudio]);
  function startListening() {
    if (!active || !constructor || document.hidden) return;
    stopAudio(); setNotice("");
    const current = generation.current;
    const session = new constructor(); recognition.current = session;
    session.lang = document.documentElement.lang || "en-US";
    session.continuous = false; session.interimResults = false;
    session.onstart = () => { if (current === generation.current) setListening(true); };
    session.onend = () => { if (current === generation.current) { setListening(false); recognition.current = null; } };
    session.onerror = event => {
      if (current !== generation.current) return;
      setListening(false);
      setNotice(event.error === "not-allowed" ? "Microphone permission was not granted. You can still type your message." : "Voice input stopped. Please try again or type your message.");
    };
    session.onresult = event => {
      if (current !== generation.current) return;
      const text = Array.from(event.results).slice(event.resultIndex).filter(result => result.isFinal).map(result => result[0].transcript).join(" ").trim();
      if (text) callback.current(text);
    };
    try { session.start(); } catch { setNotice("Voice input could not start. You can still type your message."); }
  }
  function stopListening() { recognition.current?.stop(); setListening(false); }
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
  return { listening, speaking, notice, canListen: Boolean(constructor), canSpeak, startListening, stopListening, speak, stopAudio };
}
