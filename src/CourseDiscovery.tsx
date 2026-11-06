import { useEffect, useMemo, useRef, useState } from "react";
import {
  academyCataloguePage, discoveryFilterOptions, emptyDiscoveryChoices, filterDiscoveryCourses,
  loadAcademyCatalogue, readDiscoveryChoices, saveDiscoveryChoices,
  type CourseCatalogue, type DiscoveryChoices, type DiscoveryFilters
} from "./course-discovery";
import "./course-discovery.css";

export function CourseDiscovery({ accountId, query, onQueryChange, onMyLearning, onLms }: {
  accountId: string; query: string; onQueryChange: (query: string) => void;
  onMyLearning: () => void; onLms: () => void;
}) {
  // The parent keys this component by authenticated account, including in-flight requests.
  const [choices, setChoices] = useState<DiscoveryChoices>(() => {
    try { return readDiscoveryChoices(window.sessionStorage, accountId); } catch { return { ...emptyDiscoveryChoices }; }
  });
  const [catalogue, setCatalogue] = useState<CourseCatalogue | null>(null);
  const [error, setError] = useState("");
  const [storageNotice, setStorageNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const details = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true); setError(""); setCatalogue(null);
    void loadAcademyCatalogue(abort.signal).then(value => {
      if (!abort.signal.aborted) setCatalogue(value);
    }).catch(() => {
      if (!abort.signal.aborted) setError("The published course catalogue could not be loaded. Retry or open the Academy catalogue.");
    }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [refresh]);

  function choose(next: DiscoveryChoices) {
    setChoices(next);
    try { saveDiscoveryChoices(window.sessionStorage, accountId, next); setStorageNotice(""); }
    catch { setStorageNotice("Your choices apply to this page only because browser storage is unavailable."); }
  }
  const courses = catalogue?.courses ?? [];
  const filtered = useMemo(() => filterDiscoveryCourses(courses, query, choices), [catalogue, query, choices]);
  const selected = courses.find(course => course.courseId === choices.selectedId);
  const hasFilters = Boolean(query || choices.category || choices.level || choices.deliveryMode);
  const filterLabels: Array<[keyof DiscoveryFilters, string, string]> = [
    ["category", "Subject / topic", "All subjects"], ["level", "Level", "All levels"], ["deliveryMode", "Delivery", "All delivery modes"]
  ];

  return <section className="course-discovery" aria-label="Browse Academy courses">
    <div className="course-discovery-heading"><div><p className="student-kicker">Published Academy catalogue</p><h2>Find your next course</h2>
      <p>Explore course overviews by subject and level. Check each overview for registration and availability.</p></div>
      <button type="button" className="student-secondary-action" onClick={onMyLearning}>My learning</button></div>
    <p className="course-discovery-note">Browsing or selecting a course does not enrol you. Your registered LMS learning appears separately.</p>
    {storageNotice && <p role="status">{storageNotice}</p>}
    {loading && <p role="status">Loading the published Academy catalogue…</p>}
    {error && <div className="course-discovery-error" role="alert"><p>{error}</p><button type="button" onClick={() => setRefresh(value => value + 1)}>Retry catalogue</button> <a href={academyCataloguePage} target="_blank" rel="noopener noreferrer">Open Academy catalogue ↗</a></div>}
    {!loading && !error && catalogue && <>
      <div className="course-discovery-filters">
        {filterLabels.map(([field, label, all]) => <label key={field}>{label}<select value={choices[field]} onChange={event => choose({ ...choices, [field]: event.target.value })}>
          <option value="">{all}</option>
          {choices[field] && !discoveryFilterOptions(courses, field).includes(choices[field]) && <option value={choices[field]}>{choices[field]} (no longer listed)</option>}
          {discoveryFilterOptions(courses, field).map(value => <option key={value} value={value}>{value}</option>)}
        </select></label>)}
        <button type="button" disabled={!hasFilters} onClick={() => { onQueryChange(""); choose({ ...emptyDiscoveryChoices, selectedId: choices.selectedId }); }}>Reset filters</button>
      </div>
      <p role="status" aria-live="polite" aria-atomic="true">{filtered.length} of {courses.length} course{courses.length === 1 ? "" : "s"}{query.trim() ? ` matching “${query.trim()}”` : ""}</p>
      <div className="course-discovery-layout"><div className="course-discovery-list">
        {filtered.map(course => <article key={course.courseId} className={selected?.courseId === course.courseId ? "course-discovery-card is-selected" : "course-discovery-card"}>
          <p className="student-kicker">{course.category}</p><h3>{course.title}</h3><p>{course.level} · {course.deliveryMode}</p><p>{course.estimatedEffort}</p>
          <button type="button" aria-pressed={selected?.courseId === course.courseId} aria-label={`View details: ${course.title}`} onClick={() => { choose({ ...choices, selectedId: course.courseId }); window.requestAnimationFrame(() => details.current?.focus()); }}>View details</button>
        </article>)}
        {filtered.length === 0 && <div className="course-discovery-empty"><h3>No matching courses</h3><p>Try a different search, subject or level, or reset the filters.</p></div>}
      </div>
      <aside className="course-discovery-details" aria-label="Selected catalogue course">
        <h3 ref={details} tabIndex={-1}>{selected?.title ?? "Select a course"}</h3>
        {selected ? <><dl><div><dt>Course code</dt><dd>{selected.courseId}</dd></div><div><dt>Subject / topic</dt><dd>{selected.category}</dd></div><div><dt>Level</dt><dd>{selected.level}</dd></div><div><dt>Delivery</dt><dd>{selected.deliveryMode}</dd></div><div><dt>Estimated effort</dt><dd>{selected.estimatedEffort}</dd></div></dl>
          {!filtered.includes(selected) && <p>Your selected course is outside the current filters.</p>}
          <a className="course-overview-link" href={selected.courseUrl} target="_blank" rel="noopener noreferrer">Open course overview ↗</a>
          <p>The overview provides the course content, availability and registration options. Some courses accept enquiries only.</p>
          <button type="button" className="student-text-button" onClick={() => choose({ ...choices, selectedId: "" })}>Clear selection</button></>
          : <p>{choices.selectedId ? "Your previously selected course is no longer in the published catalogue. Choose another course to continue." : "Choose View details to review course metadata and open its official overview."}</p>}
      </aside></div>
      <p className="course-discovery-note">Catalogue published {catalogue.generatedOn}. <a href={academyCataloguePage} target="_blank" rel="noopener noreferrer">View the Academy website ↗</a></p>
    </>}
    <div className="course-discovery-next"><h3>Looking for protected Academy lessons?</h3><p>Open the Academy LMS to review the courses available to your organisation and explicitly enrol where permitted.</p><button type="button" onClick={onLms}>Open Academy LMS</button></div>
  </section>;
}
