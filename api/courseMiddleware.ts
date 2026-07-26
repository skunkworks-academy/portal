import { HttpError } from "./http.js";
import { ApiCourseLesson, exchangeBulkMailFinalAssessment, findExchangeBulkMailLesson } from "./courseContent.js";

export type CourseProgressPayload = {
  lessonId?: string;
  status?: "not_started" | "in_progress" | "completed";
  percentComplete?: number;
  completedAt?: string;
  timeSpentSeconds?: number;
};

export type AssessmentPayload = {
  answers?: Record<string, string>;
};

export function requireCourseLesson(lessonId: string): ApiCourseLesson {
  const lesson = findExchangeBulkMailLesson(lessonId);
  if (!lesson) throw new HttpError(404, `Course lesson ${lessonId} was not found.`);
  return lesson;
}

export function validateProgressPayload(payload: CourseProgressPayload) {
  if (!payload || typeof payload !== "object") throw new HttpError(400, "Progress payload is required.");
  if (!payload.lessonId) throw new HttpError(400, "lessonId is required.");

  const lesson = requireCourseLesson(payload.lessonId);
  const status = payload.status ?? "in_progress";
  if (!["not_started", "in_progress", "completed"].includes(status)) {
    throw new HttpError(400, "status must be not_started, in_progress, or completed.");
  }

  const percentComplete = Number(payload.percentComplete ?? (status === "completed" ? 100 : 0));
  if (!Number.isFinite(percentComplete) || percentComplete < 0 || percentComplete > 100) {
    throw new HttpError(400, "percentComplete must be a number between 0 and 100.");
  }

  return {
    lessonId: lesson.id,
    lessonTitle: lesson.title,
    moduleId: lesson.moduleId,
    moduleTitle: lesson.moduleTitle,
    status,
    percentComplete,
    completedAt: payload.completedAt ?? null,
    timeSpentSeconds: Number(payload.timeSpentSeconds ?? 0),
    acceptedAt: new Date().toISOString()
  };
}

export function scoreFinalAssessment(payload: AssessmentPayload) {
  if (!payload || typeof payload !== "object" || !payload.answers) {
    throw new HttpError(400, "Assessment answers are required.");
  }

  const answers = payload.answers;
  const graded = exchangeBulkMailFinalAssessment.map((question) => {
    const submitted = answers[question.id] ?? "";
    const correct = submitted === question.answer;
    return {
      id: question.id,
      prompt: question.prompt,
      submitted,
      correct,
      answer: question.answer,
      explanation: question.explanation
    };
  });

  const correct = graded.filter((item) => item.correct).length;
  const total = exchangeBulkMailFinalAssessment.length;
  const score = Math.round((correct / total) * 100);

  return {
    score,
    total,
    correct,
    passed: score >= 80,
    requiredScore: 80,
    graded,
    submittedAt: new Date().toISOString()
  };
}
