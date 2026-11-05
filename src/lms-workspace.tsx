import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMsal } from "@azure/msal-react";
import { portalApi, type LmsCourseRecord, type LmsEnrolmentRecord, type LmsLessonRecord, type LmsProgressRecord } from "./api";
import "./lms-workspace.css";
import { learningErrorMessage } from "./learning-errors";
import { enrolledLearning } from "./my-learning";

type Mode = "student" | "instructor" | "staff";

function friendlyError(error: unknown) {
  return learningErrorMessage(error, "lms");
}

export function LmsWorkspace({ mode, scope = "catalogue", query = "", onBrowseCourses }: {
  mode: Mode; scope?: "catalogue" | "enrolled"; query?: string; onBrowseCourses?: () => void;
}) {
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
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonType, setLessonType] = useState<"pdf" | "video">("pdf");
  const [lessonBlobKey, setLessonBlobKey] = useState("");

  useEffect(() => {
    // Reset selection across Microsoft identities and role changes, not refreshes.
    setSelectedId("");
  }, [account?.homeAccountId, mode]);

  useEffect(() => {
    let cancelled = false;
    // Never show stale records from a previous Microsoft account or refresh.
    setCourses([]); setEnrolments([]); setProgress(null); setLessons([]);
    setError(""); setLoading(true);
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

  const learning = useMemo(() => enrolledLearning(courses, enrolments), [courses, enrolments]);
  const enrolledIds = useMemo(() => new Set(learning.courses.map(course => course.id)), [learning]);
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

  function addLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!auth || !selected || selected.status !== "draft" || !lessonTitle.trim()) return;
    const current = auth;
    void execute(async () => {
      await portalApi.lmsAddLesson(selected.id, {
        title: lessonTitle.trim(),
        mediaType: lessonType,
        mimeType: lessonType === "pdf" ? "application/pdf" : "video/mp4",
        blobKey: lessonBlobKey.trim()
      }, current);
      setLessonTitle(""); setLessonBlobKey("");
    }, "Protected lesson metadata saved. Media access requires separately authorised private delivery.");
  }

  const isStudent = mode === "student";
  const personal = isStudent && scope === "enrolled";
  const published = courses.filter(c => c.status === "published").length;
  const listedCourses = (personal ? learning.courses : courses).filter(course =>
    `${course.title} ${course.description}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const completed = progress?.completedLessonIds.length ?? 0;

  return (
    <section className="lms-workspace" aria-label="Academy learning management">
      <div className="lms-heading">
        <div><p className="lms-eyebrow">SKUNKWORKS ACADEMY · MICROSOFT-SECURED</p>
          <h2>{personal ? "My learning" : isStudent ? "Academy LMS" : mode === "staff" ? "Academy course governance" : "Instructor course studio"}</h2>
          <p>{personal ? "Your recorded Academy enrolments. Progress comes from recorded lesson activity." : isStudent ? "Published courses available to your Academy organisation. Review a course and choose Enrol to register." : "Manage genuine Academy course records. Drafts require review and staff approval before publication."}</p>
        </div>
        <button type="button" className="lms-secondary" disabled={loading || busy} onClick={() => setRefresh(x => x + 1)}>Refresh records</button>
      </div>

      {notice && <p className="lms-notice" role="status">{notice}</p>}
      {error && <div className="lms-error" role="alert"><strong>Learning service requires attention</strong><p>{error}</p><a href="mailto:training@skunkworks.africa">Contact Academy support</a></div>}
      {personal && onBrowseCourses && <button type="button" className="lms-secondary" onClick={onBrowseCourses}>Browse courses</button>}
      {loading ? <p role="status" className="lms-pending">Loading authenticated Academy records…</p> : !error && <>
        <div className="lms-metrics" aria-label="Recorded Academy information">
          {!personal && <article><strong>{courses.length}</strong><span>{isStudent ? "Published courses" : "Visible courses"}</span></article>}
          <article><strong>{isStudent ? learning.enrolments.length : published}</strong><span>{isStudent ? "My enrolments" : "Published courses"}</span></article>
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
            <h3>{personal ? "My enrolled courses" : isStudent ? "Published LMS courses" : "Course records"}</h3>
            {query.trim() && <p role="status">{listedCourses.length} matching course{listedCourses.length === 1 ? "" : "s"}</p>}
            {listedCourses.map(course => <article className={selectedId === course.id ? "lms-course is-selected" : "lms-course"} key={course.id}>
              <div><span className="lms-tag">{course.status}</span><h4>{course.title}</h4><p>{course.description || "No course description provided."}</p></div>
              <div className="lms-actions">
                <button type="button" disabled={busy} onClick={() => setSelectedId(course.id)}>{selectedId === course.id ? "Selected" : "View details"}</button>
                {isStudent && !personal && !enrolledIds.has(course.id) && <button type="button" disabled={busy || !auth} onClick={() => auth && void execute(() => portalApi.lmsEnrol(course.id, auth), "Course enrolment recorded.")}>Enrol</button>}
                {isStudent && enrolledIds.has(course.id) && <span className="lms-enrolled">Enrolled</span>}
                {!isStudent && course.status === "draft" && <button type="button" disabled={busy || !auth} onClick={() => auth && void execute(() => portalApi.lmsReviewCourse(course.id, auth), "Course submitted for review.")}>Submit for review</button>}
                {mode === "staff" && course.status === "review" && <button type="button" disabled={busy || !auth} onClick={() => auth && void execute(() => portalApi.lmsPublishCourse(course.id, auth), "Course published.")}>Approve and publish</button>}
              </div>
            </article>)}
            {personal && learning.enrolments.length === 0 && <div className="lms-empty"><h4>No enrolled courses yet</h4><p>No course enrolments are recorded for this Microsoft account. Browse the Academy catalogue to find a course.</p></div>}
            {personal && learning.unavailable.length > 0 && <p className="lms-empty" role="status">{learning.unavailable.length} recorded enrolment{learning.unavailable.length === 1 ? " has" : "s have"} course details that are not currently available to this account. Contact Academy support for access.</p>}
            {listedCourses.length === 0 && (!personal || learning.courses.length > 0) && <p className="lms-empty">{query.trim() ? "No courses match your search." : `No ${isStudent ? "published" : "visible"} courses are recorded in your Academy organisation.`}</p>}
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
                  {!isStudent && selected.status === "draft" && <form className="lms-create lms-lesson-authoring" onSubmit={addLesson}>
                    <h4>Add protected lesson metadata</h4>
                    <label>Lesson title<input required maxLength={200} value={lessonTitle} onChange={e => setLessonTitle(e.target.value)} placeholder="Lesson title" /></label>
                    <label>Media type<select value={lessonType} onChange={e => setLessonType(e.target.value as "pdf" | "video")}><option value="pdf">PDF document</option><option value="video">MP4 video</option></select></label>
                    <label>Private storage object key<input required value={lessonBlobKey} onChange={e => setLessonBlobKey(e.target.value)} placeholder={selected.organizationId + "/private/lesson.pdf"} /></label>
                    <p>The object must already exist in authorised private storage. Use a key beginning with <code>{selected.organizationId}/</code>. This form does not upload media or generate public download URLs.</p>
                    <button type="submit" disabled={busy || !lessonTitle.trim() || !lessonBlobKey.trim()}>Save lesson metadata</button>
                  </form>}
                  <h4>Lessons ({lessons.length})</h4>
                  {mode === "staff" && selected.status === "published" && lessons.length > 0 && <form key={selected.id} className="lms-create" onSubmit={event => {
                    event.preventDefault();
                    if (!auth) return;
                    const data = new FormData(event.currentTarget);
                    void execute(() => portalApi.skunkieBindCurriculum(selected.id, {
                      companionId: "networking", catalogueTitle: "Networking Basics", version: 1,
                      lessonIds: { addressing: String(data.get("addressing")), switching: String(data.get("switching")), troubleshooting: String(data.get("troubleshooting")) }
                    }, auth), "Networking Basics lessons connected to Skunkie. Enrolled students can now use the diagnostic path.");
                  }}>
                    <h4>Connect Networking Basics to Skunkie</h4>
                    <p>Choose reviewed lessons for each skill. Saving replaces the Skunkie mapping for this course; it does not publish content or enrol students.</p>
                    {(["addressing", "switching", "troubleshooting"] as const).map(skill => <label key={skill}>{skill[0].toUpperCase() + skill.slice(1)} lesson<select name={skill} required defaultValue=""><option value="" disabled>Choose an existing lesson</option>{lessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label>)}
                    <button type="submit" disabled={busy}>Save Networking curriculum mapping</button>
                  </form>}
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
      </>}
    </section>
  );
}
