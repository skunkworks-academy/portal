import { useEffect, useState } from "react";

export type SkunkieActivity = "idle" | "wave" | "listening" | "thinking" | "speaking";
const original = "/assets/skunkie/skunkie-original-atlas-v1.webp";
const conversation = "/assets/skunkie/skunkie-conversation-atlas-v1.png";
// Real illustrated frames. These are gestures, not generated lip synchronization.
export const skunkieSequences = {
  idle: { source: original, rows: 11, row: 0, frames: [6, 6, 0, 1, 2, 3, 4, 5, 6, 6], ms: 360 },
  wave: { source: original, rows: 11, row: 3, frames: [0, 1, 2, 1, 2, 3], ms: 170 },
  listening: { source: conversation, rows: 4, row: 1, frames: [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1], ms: 150 },
  thinking: { source: conversation, rows: 4, row: 1, frames: [2, 3, 4, 5, 4, 3], ms: 200 },
  speaking: { source: conversation, rows: 4, row: 2, frames: [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1], ms: 130 }
} as const;

export function useSkunkieMotion(reduceMotion = false) {
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const [reduced, setReduced] = useState(reduceMotion);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(reduceMotion || media.matches || document.documentElement.dataset.portalMotion === "reduce");
    const visibility = () => setVisible(!document.hidden);
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-portal-motion"] });
    update(); visibility();
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", visibility);
    return () => { observer.disconnect(); media.removeEventListener("change", update); document.removeEventListener("visibilitychange", visibility); };
  }, [reduceMotion]);
  return { reduced, visible };
}

export function SkunkieAvatar({ activity = "idle", active = true, reduceMotion = false }: {
  activity?: SkunkieActivity; active?: boolean; reduceMotion?: boolean;
}) {
  const { reduced, visible } = useSkunkieMotion(reduceMotion);
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState(false);
  const sequence = reduced || failed ? skunkieSequences.idle : skunkieSequences[activity];
  useEffect(() => {
    setFrame(0);
    if (!active || reduced || !visible) return;
    const timer = window.setInterval(() => setFrame(value => (value + 1) % sequence.frames.length), sequence.ms);
    return () => window.clearInterval(timer);
  }, [active, reduced, visible, sequence]);
  useEffect(() => {
    const probe = new Image();
    probe.onerror = () => setFailed(true);
    probe.src = sequence.source;
    return () => { probe.onerror = null; };
  }, [sequence.source]);
  const column = reduced ? 6 : sequence.frames[frame % sequence.frames.length];
  return <span className="skunkie-avatar" aria-hidden="true" data-activity={activity} data-animated={active && !reduced && visible}><span className="skunkie-avatar__frame"
    style={{ backgroundImage: `url("${sequence.source}")`, backgroundSize: `800% ${sequence.rows * 100}%`,
      backgroundPosition: `${column / 7 * 100}% ${sequence.row / (sequence.rows - 1) * 100}%`,
      aspectRatio: sequence.rows === 11 ? "192 / 208" : "192 / 256", bottom: sequence.rows === 11 ? "3.9%" : 0 }} /></span>;
}
