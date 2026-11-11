import { useEffect, useState } from "react";

export type SkunkieActivity = "idle" | "wave" | "listening" | "thinking" | "speaking";
export const SKUNKIE_MOTION_SRC = "/assets/skunkie/skunkie-motion-atlas-v2.webp";
export const SKUNKIE_STILL_SRC = "/assets/skunkie/skunkie-motion-still-v2.webp";
export const SKUNKIE_MOTION_GRID = { columns: 6, rows: 8, width: 288, height: 384 } as const;
// Real illustrated frames. These are gestures, not generated lip synchronization.
export const skunkieSequences = {
  idle: { frames: [0, 1, 2, 3, 4, 5, 42, 43, 44, 45, 46, 47], ms: 300 },
  wave: { frames: [24, 25, 26, 27, 28, 29], ms: 170 },
  listening: { frames: [30, 31, 32, 33, 34, 35, 6, 7, 8, 9, 10, 11], ms: 220 },
  thinking: { frames: [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], ms: 240 },
  speaking: { frames: [36, 37, 38, 39, 40, 41, 40, 39, 38, 37], ms: 130 }
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
  const [loaded, setLoaded] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const sequence = reduced ? skunkieSequences.idle : skunkieSequences[activity];
  const animated = loaded && active && !reduced && visible;
  useEffect(() => {
    setFrame(0);
    if (!animated) return;
    const timer = window.setInterval(() => setFrame(value => (value + 1) % sequence.frames.length), sequence.ms);
    return () => window.clearInterval(timer);
  }, [animated, sequence]);
  useEffect(() => {
    const probe = new Image();
    let cancelled = false;
    const ready = () => { if (!cancelled) setLoaded(true); };
    probe.onload = () => {
      if (typeof probe.decode === "function") void probe.decode().then(ready, () => {});
      else ready();
    };
    probe.src = SKUNKIE_MOTION_SRC;
    return () => { cancelled = true; probe.onload = null; };
  }, []);
  const index = reduced || !active ? 0 : sequence.frames[frame % sequence.frames.length];
  const column = index % SKUNKIE_MOTION_GRID.columns;
  const row = Math.floor(index / SKUNKIE_MOTION_GRID.columns);
  return <span className="skunkie-avatar" aria-hidden="true" data-activity={activity} data-animated={animated}>
    {loaded ? <span className="skunkie-avatar__frame" data-frame={index}
      style={{ backgroundImage: `url("${SKUNKIE_MOTION_SRC}")`, backgroundSize: "600% 800%",
        backgroundPosition: `${column / 5 * 100}% ${row / 7 * 100}%`,
        aspectRatio: "288 / 384", bottom: 0 }} /> : fallbackFailed ?
      <span className="skunkie-avatar__placeholder">S</span> :
      <img className="skunkie-avatar__still" src={SKUNKIE_STILL_SRC} alt="" width="288" height="384" onError={() => setFallbackFailed(true)} />}
  </span>;
}
