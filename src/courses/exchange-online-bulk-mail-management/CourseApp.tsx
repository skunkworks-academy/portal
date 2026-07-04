import { useEffect, useMemo, useState } from "react";
import {
  allLessons,
  courseCompletionCriteria,
  courseMeta,
  courseModules,
  courseResources,
  finalAssessment,
  sourceReferences
} from "./courseData";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "/api";
const storageKey = "skunkworks:exo-bulk-mail-course-progress";
const answerKey = "skunkworks:exo-bulk-mail-course-answers";

type CompletionState = Record<string, boolean>;
type AssessmentResult = { score: number; passed: boolean; total: number } | null;

type ApiStatus = "idle" | "online" | "offline";

function loadJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function ExchangeBulkMailCourseApp() {
  const lessons = useMemo(() => allLessons(), []);
  const [selectedLessonId, setSelectedLessonId] = useState(lessons[0]?.id ?? "");
  const [completed, setCompleted] = useState<CompletionState>(() => loadJson(storageKey, {}));
  const [answers, setAnswers] = useState<Record<string, string>>(() => loadJson(answerKey, {}));
  const [result, setResult] = useState<AssessmentResult>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("idle");
  const selectedLesson = lessons.find((lesson) => lesson.id === selectedLessonId) ?? lessons[0];
  const completedCount = lessons.filter((lesson) => completed[lesson.id]).length;
  const progress = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0;
  const criteria = courseCompletionCriteria();

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(completed));
  }, [completed]);

  useEffect(() => {
    localStorage.setItem(answerKey, JSON.stringify(answers));
  }, [answers]);

  useEffect(() => {
    fetch(`${apiBaseUrl}/courses/${courseMeta.slug}`)
      .then((response) => setApiStatus(response.ok ? "online" : "offline"))
      .catch(() => setApiStatus("offline"));
  }, []);

  async function markComplete(lessonId: string) {
    setCompleted((current) => ({ ...current, [lessonId]: true }));
    try {
      await fetch(`${apiBaseUrl}/courses/${courseMeta.slug}/progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, status: "completed", percentComplete: 100, completedAt: new Date().toISOString() })
      });
      setApiStatus("online");
    } catch {
      setApiStatus("offline");
    }
  }

  async function submitAssessment() {
    const total = finalAssessment.length;
    const correct = finalAssessment.filter((question) => answers[question.id] === question.answer).length;
    const localResult = { score: Math.round((correct / total) * 100), passed: correct / total >= 0.8, total };
    setResult(localResult);

    try {
      const response = await fetch(`${apiBaseUrl}/courses/${courseMeta.slug}/assessments/final`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers })
      });
      if (response.ok) setResult(await response.json());
      setApiStatus(response.ok ? "online" : "offline");
    } catch {
      setApiStatus("offline");
    }
  }

  return (
    <div className="course-page">
      <GlobalCourseHeader />
      <main id="course-main">
        <section className="course-hero">
          <div className="hero-copy">
            <p className="eyebrow">{courseMeta.code} · {courseMeta.modality}</p>
            <h1>{courseMeta.title}</h1>
            <p className="lead">{courseMeta.subtitle}</p>
            <div className="hero-actions">
              <button type="button" className="primary-action" onClick={() => document.getElementById("learning-path")?.scrollIntoView({ behavior: "smooth" })}>
                Start learning
              </button>
              <a className="ghost-action" href="https://labs.skunkworksacademy.com/">Open Labs</a>
            </div>
          </div>
          <aside className="course-scorecard" aria-label="Course progress summary">
            <div>
              <span>Progress</span>
              <strong>{progress}%</strong>
            </div>
            <div>
              <span>Completed lessons</span>
              <strong>{completedCount}/{lessons.length}</strong>
            </div>
            <div>
              <span>API middleware</span>
              <strong>{apiStatus === "idle" ? "Checking" : apiStatus === "online" ? "Online" : "Offline"}</strong>
            </div>
          </aside>
        </section>

        <section className="course-strip" aria-label="Course metadata">
          <span>{courseMeta.level}</span>
          <span>{courseMeta.duration}</span>
          <span>{courseMeta.audience}</span>
        </section>

        <section className="course-layout" id="learning-path">
          <aside className="lesson-rail" aria-label="Course modules and lessons">
            <div className="rail-head">
              <p>Learning path</p>
              <strong>{criteria.badge}</strong>
            </div>
            {courseModules.map((module) => (
              <details key={module.id} open>
                <summary>{module.title}</summary>
                <div className="rail-lessons">
                  {module.lessons.map((lesson) => (
                    <button
                      key={lesson.id}
                      type="button"
                      className={lesson.id === selectedLessonId ? "active" : completed[lesson.id] ? "complete" : ""}
                      onClick={() => setSelectedLessonId(lesson.id)}
                    >
                      <span>{lesson.type}</span>
                      {lesson.title}
                    </button>
                  ))}
                </div>
              </details>
            ))}
          </aside>

          <article className="lesson-panel" aria-live="polite">
            <div className="lesson-kicker">
              <span>{selectedLesson?.moduleTitle}</span>
              <span>{selectedLesson?.minutes} min</span>
              <span>{selectedLesson?.type}</span>
            </div>
            <h2>{selectedLesson?.title}</h2>
            <p className="lesson-summary">{selectedLesson?.summary}</p>

            <div className="objective-grid">
              {selectedLesson?.objectives.map((objective) => (
                <div key={objective} className="objective-card">{objective}</div>
              ))}
            </div>

            {selectedLesson?.sections.map((section) => (
              <section className="lesson-section" key={section.heading}>
                <h3>{section.heading}</h3>
                <p>{section.body}</p>
              </section>
            ))}

            {selectedLesson?.commands && (
              <section className="command-library" aria-label="PowerShell runbook commands">
                <h3>Runbook commands</h3>
                {selectedLesson.commands.map((command) => (
                  <div className="command-card" key={command.label}>
                    <strong>{command.label}</strong>
                    <pre><code>{command.code}</code></pre>
                  </div>
                ))}
              </section>
            )}

            {selectedLesson?.checklist && (
              <section className="checklist-card">
                <h3>Operational checklist</h3>
                <ul>
                  {selectedLesson.checklist.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
            )}

            <div className="lesson-actions">
              <button type="button" className="primary-action" onClick={() => void markComplete(selectedLesson.id)}>
                Mark lesson complete
              </button>
              <button
                type="button"
                className="ghost-action"
                onClick={() => {
                  const index = lessons.findIndex((lesson) => lesson.id === selectedLesson.id);
                  setSelectedLessonId(lessons[Math.min(index + 1, lessons.length - 1)].id);
                }}
              >
                Next lesson
              </button>
            </div>
          </article>
        </section>

        <section className="resource-section" aria-labelledby="resources-title">
          <div className="section-head">
            <p>Downloadable operating assets</p>
            <h2 id="resources-title">Course resources</h2>
            <span>Templates are implemented as web cards now and can be wired to Supabase Storage, SharePoint or the Academy publishing pipeline later.</span>
          </div>
          <div className="resource-grid">
            {courseResources.map((resource) => (
              <article key={resource.title} className="resource-card">
                <span>{resource.format}</span>
                <h3>{resource.title}</h3>
                <p>{resource.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="assessment-section" aria-labelledby="assessment-title">
          <div className="section-head">
            <p>Final knowledge check</p>
            <h2 id="assessment-title">Validate operational readiness</h2>
            <span>Pass score: {criteria.requiredAssessmentScore}%.</span>
          </div>
          <div className="assessment-grid">
            {finalAssessment.map((question) => (
              <fieldset key={question.id} className="question-card">
                <legend>{question.prompt}</legend>
                {question.options.map((option) => (
                  <label key={option}>
                    <input
                      type="radio"
                      name={question.id}
                      value={option}
                      checked={answers[question.id] === option}
                      onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))}
                    />
                    <span>{option}</span>
                  </label>
                ))}
                {result && <p className="explanation">{question.explanation}</p>}
              </fieldset>
            ))}
          </div>
          <div className="assessment-actions">
            <button type="button" className="primary-action" onClick={() => void submitAssessment()}>Submit assessment</button>
            {result && <strong className={result.passed ? "pass" : "fail"}>{result.score}% · {result.passed ? "Passed" : "Not yet passed"}</strong>}
          </div>
        </section>

        <section className="source-section" aria-labelledby="source-title">
          <div className="section-head">
            <p>Source basis</p>
            <h2 id="source-title">Research and implementation anchors</h2>
          </div>
          <ul>
            {sourceReferences.map((source) => <li key={source}>{source}</li>)}
          </ul>
        </section>
      </main>
    </div>
  );
}

function GlobalCourseHeader() {
  const links = [
    { label: "Home", href: "https://skunkworksacademy.com/" },
    { label: "Self-paced", href: "https://skunkworksacademy.com/self-paced/" },
    { label: "Portal", href: "https://portal.skunkworksacademy.com/" },
    { label: "Labs", href: "https://labs.skunkworksacademy.com/" },
    { label: "Plans", href: "https://skunkworksacademy.com/subscriptions/#pricing" }
  ];

  return (
    <header className="course-header" data-fallback-header="true">
      <a className="course-brand" href="https://skunkworksacademy.com/" aria-label="Skunkworks Academy home">
        <img src="https://raw.githubusercontent.com/skunkworks-academy/.github/refs/heads/main/images/favicon-white.png" alt="" />
        <span>Skunkworks Academy <small>Self-paced</small></span>
      </a>
      <nav aria-label="Academy navigation">
        {links.map((link) => <a href={link.href} key={link.label}>{link.label}</a>)}
      </nav>
    </header>
  );
}
