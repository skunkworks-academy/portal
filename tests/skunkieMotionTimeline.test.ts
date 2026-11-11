import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { SkunkieTimeline, skunkieSequences, type SkunkieActivity } from "../src/skunkie-motion-timeline";
import motion from "../src/skunkie-motion.json";
import report from "../docs/skunkie-motion-flow-validation.json";

const pairs = new Set(motion.flow.pairs.map(pair => pair.join(":")));
describe("continuous Skunkie motion", () => {
  it("covers all cycles and neutral transitions with measured motion fields", () => {
    const seen = new Set<number>();
    for (const sequence of Object.values(skunkieSequences)) {
      sequence.frames.forEach((from,i) => {
        seen.add(from);
        const to = sequence.frames[(i+1)%sequence.frames.length];
        if (from !== to) expect(pairs.has([Math.min(from,to),Math.max(from,to)].join(":"))).toBe(true);
        if (from !== 0) expect(pairs.has(`0:${from}`)).toBe(true);
      });
    }
    expect(seen.size).toBe(48);
    expect(createHash("sha256").update(readFileSync(`public${motion.flow.source}`)).digest("hex")).toBe(report.flowSha256);
    expect(createHash("sha256").update(readFileSync("public/assets/skunkie/skunkie-motion-atlas-v2.webp")).digest("hex")).toBe(report.atlasSha256);
  });
  it("interpolates between poses without changing the current pose when an activity is requested", () => {
    const clock = new SkunkieTimeline();
    const before = clock.advance(150);
    expect(before).toEqual({ from:0, to:1, progress:.5 });
    clock.request("wave");
    expect(clock.advance(0)).toEqual(before);
    expect(clock.advance(150)).toEqual({ from:1, to:0, progress:0 });
    expect(clock.advance(280)).toEqual({ from:0, to:24, progress:0 });
    expect(clock.advance(320)).toEqual({ from:24, to:25, progress:0 });
  });
  it("stays continuous across every loop and rapid activity changes", () => {
    const clock = new SkunkieTimeline();
    let previous = clock.advance(0);
    const activities = Object.keys(skunkieSequences) as SkunkieActivity[];
    for (let i=0; i<1800; i++) {
      if (i%180===0) clock.request(activities[Math.floor(i/180)%activities.length]);
      const current = clock.advance(16);
      expect(current.progress).toBeGreaterThanOrEqual(0); expect(current.progress).toBeLessThan(1);
      if (current.from !== previous.from || current.to !== previous.to) expect(current.from).toBe(previous.to);
      if (current.from !== current.to) expect(pairs.has([Math.min(current.from,current.to),Math.max(current.from,current.to)].join(":"))).toBe(true);
      previous = current;
    }
  });
});
