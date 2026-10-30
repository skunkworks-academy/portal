import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMsal } from "@azure/msal-react";
import { portalApi, type LmsCourseRecord, type LmsEnrolmentRecord, type LmsLessonRecord, type LmsProgressRecord } from "./api";
import "./lms-workspace.css";

type Mode = "student" | "instructor" | "staff";

function friendlyError(error: unknown) {
  const value = error instanceof Error ? error.message : "";
  if (/membership not provisioned|403/.test(value)) return "Your Microsoft account is signed in, but your LMS organisation membership is not yet provisioned. Contact Academy support to request access.";
  if (/storage is not configured|database unavailable|503/.test(value)) return "The Academy learning database is unavailable. Your existing learning records have not been changed.";
  if (/401|token|interaction_required/i.test(value)) return "Your Microsoft session needs attention. Sign in again to continue.";
  return "The Academy learning service could not complete this request. Try again or contact Academy support.";
}

export function LmsWorkspace({ mode }: { mode: Mode }) {
  const { instance, accounts } = useMsal();
  const account = accounts[0];
  const auth = account ? { instance, account } : undefined;
  const [courses, setCourses] = useState<LmsCourseRecord[]>([]);
  const [enrolments, setEnrolments] = useState<LmsEnrolmentRecord[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [lessons, setLessons] = useState<LmsLessonRecord[]>([]);
  const [progress, setProgress] = useState<LmsProgressRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    let cancelled = false;
    // Switches of Microsoft identities must not show another learner's records.
    setCourses([]); setEnrolments([]); setSelectedId(""); setProgress(null); setLessons([]);
    setError(""); setNotice(""); setLoading(true);
    if (!auth) { setError("Microsoft authentication is required."); setLoading(false); return; }
    const current = auth;
    void (async () => {
      try {
        const [nextCourses, nextEnrolments] = await Promise.all([
          portalApi.lmsCourses(current),
          mode === "student" ? portalApi.lmsMyEnrolments(current) : Promise.resolve([])
        ]);
        if (!cancelled) { setCourses(nextCourses); setEnrolments(nextEnrolments); }
      } catch (cause) {
        if (!cancelled) setError(friendlyError(cause));
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  // Authenticated account is the stable identity boundary, not MSAL render state.
  }, [account?.homeAccountId, mode, refresh]);

  const enrolledIds = useMemo(() => new Set(enrolments.map(e => e.courseId)), [enrolments]);
  const selected = courses.find(c => c.id === selectedId);
  const canReadLessons = Boolean(selected) && (mode !== "student" || enrolledIds.has(selectedId));

  useEffect(() => {
    let cancelled = false;
    setLessons([]); setProgress(null); setDetailError("");
    if (!auth || !selectedId || !canReadLessons) { setDetailsLoading(false); return; }
    const current = auth;
    setDetailsLoading(true);
    void (async () => {
      try {
        const [items, saved] = await Promise.all([
          portalApi.lmsLessons(selectedId, current),
          mode === "student" ? portalApi.lmsProgress(selectedId, current) : Promise.resolve(null)
        ]);
        if (!cancelled) { setLessons(items); setProgress(saved); }
      } catch (cause) {
        if (!cancelled) setDetailError(friendlyError(cause));
      } finally { if (!cancelled) setDetailsLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [account?.homeAccountId, mode, selectedId, canReadLessons, refresh]);

  async function execute(action: () => Promise<unknown>, message: string) {
    setBusy(true); setError(""); setDetailError(""); setNotice("");
    try {
      await action();
      setNotice(message);
      setRefresh(value => value + 1);
    } catch (cause) { setError(friendlyError(cause)); }
    finally { setBusy(false); }
  }

  function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !title.trim()) return;
    const current = auth;
    void execute(async () => {
      const created = await portalApi.lmsCreateCourse({ title: title.trim(), description: description.trim() }, current);
      setTitle(""); setDescription(""); setSelectedId(created.id);
    }, "Draft course created. Submit it for review when ready.");
  }

  const isStudent = mode === "student";
  const published = courses.filter(c => c.status === "published").length;
  const myCourses = isStudent ? courses.filter(c => enrolledIds.has(c.id)) : courses;
  const completed = progress?.completedLessonIds.length ?? 0;

  return (
    <section className="lms-workspace" aria-label="Academy learning management">
      <div className="lms-heading">
        <div><p className="lms-eyebrow">SKUNKWORKS ACADEMY · MICROSOFT-SECURED</p>
          <h2>{isStudent ? "My Academy learning" : mode === "staff" ? "Academy course governance" : "Instructor course studio"}</h2>
          <p>{isStudent ? "Published Academy courses and your verified enrolments. Progress comes from recorded lesson activity." : "Manage genuine Academy course records. Drafts require review and staff approval before publication."}</p>
        </div>
        <button type="button" className="lms-secondary" disabled={loading || busy} onClick={() => setRefresh(x => x + 1)}>Refresh records</button>
      </div>

      {notice && <p className="lms-notice" role="status">{notice}</p>}
      {error && <div className="lms-error" role="alert"><strong>Learning service requires attention</strong><p>{error}</p><a href="mailto:training@skunkworks.africa">Contact Academy support</a></div>}
      {loading ? <p role="status" className="lms-pending">Loading authenticated Academy records…</p> : !error && <>
        <div className="lms-metrics" aria-label="Recorded Academy information">
          <article><strong>{courses.length}</strong><span>{isStudent ? "Published courses" : "Visible courses"}</span></article>
          <article><strong>{isStudent ? enrolments.length : published}</strong><span>{isStudent ? "My enrolments" : "Published courses"}</span></article>
        </div>

        {!isStudent && <form className="lms-create" onSubmit={createCourse}>
          <h3>Create a draft course</h3>
          <label>Course title<input required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="Enter an actual Academy course title" /></label>
          <label>Description<textarea maxLength={5000} value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Learning outcomes and course overview" /></label>
          <button disabled={busy || !title.trim()} type="submit">Create draft</button>
          <p>Only authorised instructor or staff accounts can author courses. No sample courses are created.</p>
        </form>}

        <div className="lms-layout">
          <div className="lms-list" aria-label="LMS course list">
            <h3>{isStudent ? "Published course catalogue" : "Course records"}</h3>
            {courses.map(course => <article className={selectedId === course.id ? "lms-course is-selected" : "lms-course"} key={course.id}>
              <div><span className="lms-tag">{course.status}</span><h4>{course.title}</h4><p>{course.description || "No course description provided."}</p></div>
              <div className="lms-actions">
                <button type="button" disabled={busy} onClick={() => setSelectedId(course.id)}>{selectedId === course.id ? "Selected" : "View details"}</button>
                {isStudent && !enrolledIds.has(course.id) && <button type="button" disabled={busy || !auth} onClick={() => auth && void execute(() => portalApi.lmsEnrol(course.id, auth), "Course enrolment recorded.")}>Enrol</button>}
                {isStudent && enrolledIds.has(course.id) && <span className="lms-enrolled">Enrolled</span>}
                {!isStudent && course.status === "draft" && <button type="button" disabled={busy || !auth} onClick={() => auth && void execute(() => portalApi.lmsReviewCourse(course.id, auth), "Course submitted for review.")}>Submit for review</button>}
                {mode === "staff" && course.status === "review" && <button type="button" disabled={busy || !auth} onClick={() => auth && void execute(() => portalApi.lmsPublishCourse(course.id, auth), "Course published.")}>Approve and publish</button>}
              </div>
            </article>)}
            {courses.length === 0 && <p className="lms-empty">No {isStudent ? "published" : "visible"} courses are recorded in your Academy organisation.</p>}
          </div>

          <section className="lms-details" aria-label="Selected course details">
            <h3>{selected ? selected.title : "Select a course"}</h3>
            {!selected && <p className="lms-empty">Select a course above to inspect its status, real lessons and recorded progress.</p>}
            {selected && <>
              <p>{selected.description || "No overview recorded."}</p>
              {isStudent && !enrolledIds.has(selected.id)
                ? <p className="lms-empty">Enrol before viewing protected lesson information or recording progress.</p>
                : detailsLoading ? <p role="status">Loading authorised lessons…</p>
                : detailError ? <p className="lms-error" role="alert">{detailError}</p>
                : <>
                  <h4>Lessons ({lessons.length})</h4>
                  {isStudent && <p className="lms-progress-note">{lessons.length
                    ? `${completed} of ${lessons.length} recorded lessons completed`
                    : "No lessons published for this course. Progress is not calculated."}</p>}
                  {lessons.map(lesson => {
                    const done = progress?.completedLessonIds.includes(lesson.id) ?? false;
                    return <div className="lms-lesson" key={lesson.id}>
                      <div><strong>{lesson.title}</strong><small>{lesson.mediaType.toUpperCase()}{done ? " · Completed" : ""}</small></div>
                      {isStudent && <button type="button" disabled={busy || done || !auth} onClick={() => auth && void execute(() => portalApi.lmsCompleteLesson(selected.id, lesson.id, auth), "Lesson completion saved to Academy.")}>{done ? "Completed" : "Mark complete"}</button>}
                    </div>;
                  })}
                  {lessons.length === 0 && <p className="lms-empty">No lesson metadata is available. Course materials are not exposed through public files.</p>}
                  <p className="lms-footnote">Protected media playback and uploads require private storage delivery and independent verification. A lesson title alone does not grant media access.</p>
                </>}
            </>}
          </section>
        </div>
        {isStudent && myCourses.length === 0 && <p className="lms-footnote">You have no recorded LMS course enrolments yet. Browse the published catalogue to enrol.</p>}
      </>}
    </section>
  );
}
