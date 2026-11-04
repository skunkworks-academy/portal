import { useState } from "react";
import { SKUNKIE_AVATAR_SRC } from "../skunkie-assets";
import { companionRegistry, routeLearningGoal, type RoutingDecision } from "./orchestrator";

type Props = { onAssess: () => void; onCourses: () => void };
export function SkunkieOrchestrationPanel({ onAssess, onCourses }: Props) {
  const [goal, setGoal] = useState("");
  const [decision, setDecision] = useState<RoutingDecision | null>(null);
  return (
    <section className="student-view student-companion-view" aria-label="Skunkie learning orchestrator">
      <div className="student-companion-header">
        <div className="student-skunkie-avatar" aria-hidden="true"><img src={SKUNKIE_AVATAR_SRC} alt="" width="64" height="64" /></div>
        <div><p className="student-kicker">Academy Cognitive Orchestrator · Pilot</p><h2>Skunkie</h2>
          <p>Tell me what you'd like to learn. I'll suggest a specialist or a diagnostic assessment.</p></div>
      </div>
      <form onSubmit={(event) => { event.preventDefault(); setDecision(routeLearningGoal(goal)); }}>
        <label htmlFor="skunkie-goal">Your learning goal</label>
        <textarea id="skunkie-goal" rows={3} maxLength={1000} value={goal}
          onChange={(event) => { setGoal(event.target.value); setDecision(null); }}
          placeholder="For example: I want to understand VLANs and subnetting" style={{ display: "block", width: "100%", maxWidth: 720 }} />
        <button type="submit">Find my next step</button>
      </form>
      {decision && <div role="status" aria-live="polite" className="student-panel">
        <h3>{decision.companionName ? `Suggested specialist: ${decision.companionName}` : "Skills assessment recommended"}</h3>
        <p>{decision.explanation}</p>
        <button type="button" onClick={decision.nextAction === "assess" ? onAssess : onCourses}>
          {decision.nextAction === "assess" ? "Open learner assessment" : "Browse Academy courses"}
        </button>
      </div>}
      <p><small>Available specialist domains: {companionRegistry.map((item) => item.name).join(" · ")}.</small></p>
      <p><small>This pilot is a transparent routing aid, not an AI assessment or a course entitlement check. Restricted content requires LMS authorisation. For live tutoring, use the Academy's authenticated Skunkie chat.</small></p>
    </section>
  );
}
