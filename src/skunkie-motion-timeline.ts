import motion from "./skunkie-motion.json";

export type SkunkieActivity = keyof typeof motion.sequences;
export const skunkieSequences = motion.sequences;
export type MotionSample = { from: number; to: number; progress: number };

/** Continuous pose time. Activity changes finish their current movement, return
 * through the neutral pose, and enter the newest requested activity. */
export class SkunkieTimeline {
  private activity: SkunkieActivity = "idle";
  private requested: SkunkieActivity = "idle";
  private cursor = 0;
  private phase: "loop" | "home" | "enter" = "loop";
  private elapsed = 0;
  private from = 0;
  private to = 1;
  private duration = skunkieSequences.idle.ms;

  request(activity: SkunkieActivity) { this.requested = activity; }

  private segment(to: number, duration: number, phase: typeof this.phase) {
    this.from = this.to;
    this.to = to;
    this.duration = duration;
    this.phase = phase;
  }

  private enter() {
    this.activity = this.requested;
    this.cursor = 0;
    const sequence = skunkieSequences[this.activity];
    if (sequence.frames[0] === this.to) this.segment(sequence.frames[1], sequence.ms, "loop");
    else this.segment(sequence.frames[0], 320, "enter");
  }

  private next() {
    if (this.phase === "home") { this.enter(); return; }
    if (this.activity !== this.requested) {
      if (this.to === 0) this.enter();
      else this.segment(0, 280, "home");
      return;
    }
    const sequence = skunkieSequences[this.activity];
    if (this.phase !== "enter") this.cursor = (this.cursor + 1) % sequence.frames.length;
    this.segment(sequence.frames[(this.cursor + 1) % sequence.frames.length], sequence.ms, "loop");
  }

  advance(milliseconds: number): MotionSample {
    this.elapsed += Math.max(0, milliseconds);
    while (this.elapsed >= this.duration) { this.elapsed -= this.duration; this.next(); }
    const time = this.elapsed / this.duration;
    // Keep motion flowing through the cycle. Only ease activity entry/exit;
    // easing every illustrated pose would create a tiny stop at every frame.
    const progress = this.phase === "loop" ? time : time * time * (3 - 2 * time);
    return { from: this.from, to: this.to, progress };
  }
}
