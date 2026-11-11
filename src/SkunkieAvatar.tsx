import { useEffect, useRef, useState } from "react";
import { SkunkieTimeline, type SkunkieActivity } from "./skunkie-motion-timeline";
import { createSkunkieRenderer, SKUNKIE_MOTION_SRC, SKUNKIE_FLOW_SRC, type SkunkieRenderer } from "./skunkie-motion-renderer";

export type { SkunkieActivity } from "./skunkie-motion-timeline";
export { skunkieSequences } from "./skunkie-motion-timeline";
export { SKUNKIE_MOTION_SRC } from "./skunkie-motion-renderer";
export const SKUNKIE_STILL_SRC = "/assets/skunkie/skunkie-motion-still-v2.webp";
export const SKUNKIE_MOTION_GRID = { columns: 6, rows: 8, width: 288, height: 384 } as const;

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
  const [ready, setReady] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<SkunkieRenderer | null>(null);
  const timeline = useRef(new SkunkieTimeline());
  const requested = useRef(activity); requested.current = activity;
  const animated = ready && active && !reduced && visible;
  useEffect(() => {
    const element = canvas.current!;
    const probes: HTMLImageElement[] = [];
    let cancelled = false;
    const load = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const probe = new Image(); probes.push(probe);
      probe.onload = () => {
        if (typeof probe.decode === "function") void probe.decode().then(() => resolve(probe), reject);
        else resolve(probe);
      };
      probe.onerror = reject;
      probe.src = source;
    });
    const failed = () => { renderer.current?.dispose(); renderer.current = null; if (!cancelled) setReady(false); };
    const lost = (event: Event) => { event.preventDefault(); failed(); };
    element.addEventListener("webglcontextlost", lost);
    void Promise.all([load(SKUNKIE_MOTION_SRC), load(SKUNKIE_FLOW_SRC)]).then(([atlas, flow]) => {
      if (cancelled) return;
      renderer.current = createSkunkieRenderer(element, atlas, flow);
      if (!renderer.current) return;
      renderer.current.draw({ from: 0, to: 0, progress: 0 });
      setReady(true);
    }).catch(failed);
    return () => {
      cancelled = true; probes.forEach(probe => { probe.onload = null; probe.onerror = null; });
      element.removeEventListener("webglcontextlost", lost); failed();
    };
  }, []);
  useEffect(() => {
    if (!animated) return;
    let last: number | null = null;
    let handle = 0;
    const tick = (now: number) => {
      const painter = renderer.current;
      if (!painter) return;
      timeline.current.request(requested.current);
      // Discard long stalls. Visibility pauses retain the current pose/time.
      const sample = timeline.current.advance(last === null ? 0 : Math.min(64, now-last));
      last = now;
      try { painter.draw(sample); }
      catch { painter.dispose(); renderer.current = null; setReady(false); return; }
      handle = window.requestAnimationFrame(tick);
    };
    handle = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(handle);
  }, [animated]);
  const showCanvas = ready && active && !reduced;
  return <span className="skunkie-avatar" aria-hidden="true" data-activity={activity} data-animated={animated}>
    <canvas ref={canvas} className="skunkie-avatar__canvas" width="288" height="384" hidden={!showCanvas} />
    {!showCanvas && (fallbackFailed ?
      <span className="skunkie-avatar__placeholder">S</span> :
      <img className="skunkie-avatar__still" src={SKUNKIE_STILL_SRC} alt="" width="288" height="384" onError={() => setFallbackFailed(true)} />)}
  </span>;
}
