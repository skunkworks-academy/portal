import type { IdRAssessment, IdRRoleTemplate, IdRRoadmap, IdRMilestone } from "./model";

/** Non-AI baseline. Produces a draft; it must be reviewed before publishing. */
export function generateDraftRoadmap(
  assessment: IdRAssessment,
  template: IdRRoleTemplate,
  now: Date = new Date()
): IdRRoadmap {
  if (!assessment.consentToStore) throw new Error("Assessment storage consent is required.");
  if (!assessment.assessmentId.trim() || !assessment.learnerSubject.trim()) throw new Error("Assessment identity is required.");
  if (!assessment.targetRole.trim() || assessment.targetRole !== template.roleTitle) throw new Error("A matching target-role template is required.");
  if (!Number.isFinite(assessment.weeklyStudyHours) || assessment.weeklyStudyHours < 0 || assessment.weeklyStudyHours > 168) {
    throw new Error("Invalid weekly study hours.");
  }
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid generation time.");
  const values = new Map<string, number>();
  for (const c of assessment.competencies) {
    if (!c.competencyId || !Number.isInteger(c.level) || c.level < 0 || c.level > 4) throw new Error("Invalid competency evidence.");
    if (values.has(c.competencyId)) throw new Error("Duplicate competency.");
    values.set(c.competencyId, c.level);
  }
  const targets = new Set<string>();
  for (const c of template.competencies) {
    if (!c.competencyId || !c.label || !Number.isInteger(c.expectedLevel) || c.expectedLevel < 0 || c.expectedLevel > 4 || targets.has(c.competencyId)) {
      throw new Error("Invalid or duplicate target competency.");
    }
    targets.add(c.competencyId);
  }
  const gaps = template.competencies.filter(c => (values.get(c.competencyId) ?? 0) < c.expectedLevel);
  const strengths = template.competencies.filter(c => (values.get(c.competencyId) ?? 0) >= c.expectedLevel);
  const horizons = [30, 60, 90, 365] as const;
  const milestones: IdRMilestone[] = gaps.map((c, i) => {
    const horizonDays = horizons[Math.min(i, horizons.length - 1)];
    const due = new Date(now.getTime());
    due.setUTCDate(due.getUTCDate() + horizonDays);
    return {
      id: `gap-${i + 1}-${c.competencyId}`,
      title: `Develop ${c.label}`,
      description: `Close the gap from level ${values.get(c.competencyId) ?? 0} to level ${c.expectedLevel}.`,
      competencyId: c.competencyId,
      horizonDays,
      status: "not_started",
      evidenceRequired: c.evidenceRequired,
      dueDate: due.toISOString().slice(0, 10)
    };
  });
  const timestamp = now.toISOString();
  return {
    schemaVersion: 1,
    roadmapId: `idr-${assessment.assessmentId}`,
    assessmentId: assessment.assessmentId,
    learnerSubject: assessment.learnerSubject,
    createdAt: timestamp,
    updatedAt: timestamp,
    revision: 1,
    reviewState: "draft",
    targetRole: assessment.targetRole,
    strengths: strengths.map(c => c.label),
    skillGaps: gaps.map(c => c.label),
    milestones,
    recommendations: gaps.map(c => ({
      competencyId: c.competencyId,
      kind: "lab",
      title: `Practice ${c.label}`,
      rationale: `Evidence is needed to reach competency level ${c.expectedLevel}.`
    })),
    author: "rules_v1"
  };
}
