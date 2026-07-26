import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { PublicClientApplication, type AccountInfo } from "@azure/msal-browser";
import { loginRequest, msalConfig } from "../authConfig";
import { findRegistrationCourse, registrationCourses, type RegistrationCourse } from "./courseRegistry";
import "./styles.css";

const BRAND_ICON_BLACK = "https://raw.githubusercontent.com/skunkworks-academy/.github/refs/heads/main/images/favicon-black.png";
const BRAND_ICON_WHITE = "https://raw.githubusercontent.com/skunkworks-academy/.github/refs/heads/main/images/favicon-white.png";
const PORTAL_HOME = "https://portal.skunkworksacademy.com/";
const TRAINING_MAILBOX = "training@skunkworksacademy.com";

const msalInstance = new PublicClientApplication(msalConfig);
const root = document.getElementById("root");

function selectedSlugFromLocation() {
  const pageSlug = document.documentElement.dataset.courseSlug;
  const params = new URLSearchParams(window.location.search);
  return params.get("course") || pageSlug || "marketing-fundamentals";
}

function App() {
  const [account, setAccount] = useState<AccountInfo | null>(() => msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0] ?? null);
  const [selectedSlug, setSelectedSlug] = useState(selectedSlugFromLocation());
  const course = useMemo(() => findRegistrationCourse(selectedSlug), [selectedSlug]);
  const submitted = new URLSearchParams(window.location.search).get("submitted") === "1";

  useEffect(() => {
    const activeAccount = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0] ?? null;
    setAccount(activeAccount);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("course", course.slug);
    window.history.replaceState(null, "", url);
  }, [course.slug]);

  function selectCourse(slug: string) {
    setSelectedSlug(slug);
    const url = new URL(window.location.href);
    url.searchParams.set("course", slug);
    window.history.replaceState(null, "", url);
  }

  async function signInForCourse() {
    await msalInstance.loginRedirect({
      ...loginRequest,
      state: course.slug
    });
  }

  return (
    <div className="registration-page">
      <header className="registration-header">
        <div className="registration-shell registration-nav">
          <a className="brand" href="https://skunkworksacademy.com/" aria-label="Skunkworks Academy home">
            <img className="logo-light" src={BRAND_ICON_BLACK} alt="" />
            <img className="logo-dark" src={BRAND_ICON_WHITE} alt="" />
            <span><strong>Skunkworks Academy</strong><small>Registration</small></span>
          </a>
          <nav className="nav-links" aria-label="Registration navigation">
            <a href={PORTAL_HOME}>Portal</a>
            <a href="https://marketing.skunkworksacademy.com/">Marketing</a>
            <a href="https://labs.skunkworksacademy.com/">Labs</a>
            {account ? <span className="pill">Signed in: {account.username}</span> : <button type="button" onClick={() => void signInForCourse()}>Microsoft sign-in</button>}
          </nav>
        </div>
      </header>

      <main id="registration-main" className="registration-shell">
        {submitted && <section className="panel" role="status"><p className="eyebrow">Request submitted</p><h2>Registration request received</h2><p className="lead">The training team will review your request, confirm enrolment status and send access instructions.</p></section>}

        <section className="registration-hero">
          <CourseSummary course={course} />
          <RegistrationForm course={course} account={account} />
        </section>

        <section aria-label="All course registration pages">
          <p className="eyebrow">Registration catalogue</p>
          <h2>All available registration pages</h2>
          <div className="catalogue-grid">
            {registrationCourses.map((item) => <CourseCard key={item.slug} course={item} selected={item.slug === course.slug} selectCourse={selectCourse} />)}
          </div>
        </section>
      </main>
    </div>
  );
}

function CourseSummary({ course }: { course: RegistrationCourse }) {
  return (
    <article className="course-panel">
      <p className="eyebrow">Protected learning access</p>
      <h1>{course.title}</h1>
      <p className="lead">{course.description}</p>
      <div className="course-meta" aria-label="Course metadata">
        <span className="pill">{course.type}</span>
        <span className="pill">{course.source}</span>
        <span className="pill">{course.level}</span>
        <span className="pill">{course.duration}</span>
      </div>
      <div className="steps" aria-label="Registration workflow">
        <div className="step"><strong>1</strong><p>Submit the registration request with learner and organisation details.</p></div>
        <div className="step"><strong>2</strong><p>The training team verifies payment, cohort availability, access rights or sponsored enrolment.</p></div>
        <div className="step"><strong>3</strong><p>The learner receives portal access instructions before protected lessons, labs and assessments are opened.</p></div>
      </div>
      <div className="form-actions">
        <a className="button" href={course.overviewUrl}>View overview</a>
        <a className="button orange" href={`mailto:${TRAINING_MAILBOX}?subject=${encodeURIComponent(`Registration query: ${course.title}`)}`}>Ask training team</a>
      </div>
    </article>
  );
}

function RegistrationForm({ course, account }: { course: RegistrationCourse; account: AccountInfo | null }) {
  const nextUrl = `https://portal.skunkworksacademy.com/register/?course=${encodeURIComponent(course.slug)}&submitted=1`;
  const subject = `Course registration request: ${course.title}`;

  return (
    <aside className="form-panel">
      <p className="eyebrow">Registration request</p>
      <h2>Register for access</h2>
      <p className="note">This request does not unlock protected content immediately. Access is issued after enrolment, billing, cohort or staff approval checks are completed.</p>
      <form className="registration-form" action={`https://formsubmit.co/${TRAINING_MAILBOX}`} method="POST">
        <input type="hidden" name="_subject" value={subject} />
        <input type="hidden" name="_captcha" value="false" />
        <input type="hidden" name="_template" value="table" />
        <input type="hidden" name="_next" value={nextUrl} />
        <input type="hidden" name="course_slug" value={course.slug} />
        <input type="hidden" name="course_title" value={course.title} />
        <input type="hidden" name="course_type" value={course.type} />
        <input type="hidden" name="course_source" value={course.source} />
        <input type="hidden" name="signed_in_account" value={account?.username ?? "Not signed in on page"} />

        <div className="field-grid">
          <label>First name<input name="first_name" autoComplete="given-name" required /></label>
          <label>Last name<input name="last_name" autoComplete="family-name" required /></label>
        </div>
        <div className="field-grid">
          <label>Email<input type="email" name="email" autoComplete="email" defaultValue={account?.username ?? ""} required /></label>
          <label>Phone<input name="phone" autoComplete="tel" required /></label>
        </div>
        <div className="field-grid">
          <label>Organisation<input name="organisation" autoComplete="organization" /></label>
          <label>Country / city<input name="location" autoComplete="address-level2" /></label>
        </div>
        <div className="field-grid">
          <label>Registration type
            <select name="registration_type" required defaultValue="Individual learner">
              <option>Individual learner</option>
              <option>Corporate cohort</option>
              <option>Instructor-led class</option>
              <option>Sponsored learner</option>
              <option>Badge evidence submission</option>
            </select>
          </label>
          <label>Preferred delivery
            <select name="preferred_delivery" required defaultValue="Self-paced">
              <option>Self-paced</option>
              <option>Instructor-led online</option>
              <option>Instructor-led onsite</option>
              <option>Hybrid</option>
              <option>To be confirmed</option>
            </select>
          </label>
        </div>
        <label>Notes / purchase order / cohort details<textarea name="notes" placeholder="Add access requirement, cohort size, billing contact, purchase order number or deadline."></textarea></label>
        <label><input type="checkbox" name="access_acknowledgement" value="Accepted" required /> I understand that protected course content is available only after registration approval and enrolment confirmation.</label>
        <div className="form-actions">
          <button className="primary" type="submit">Submit registration</button>
          <a className="button" href={PORTAL_HOME}>Return to portal</a>
        </div>
      </form>
    </aside>
  );
}

function CourseCard({ course, selected, selectCourse }: { course: RegistrationCourse; selected: boolean; selectCourse: (slug: string) => void }) {
  return (
    <article className="course-card">
      <span className="pill">{course.type}</span>
      <h3>{course.title}</h3>
      <p>{course.level} · {course.duration}</p>
      <button className={selected ? "primary" : undefined} type="button" onClick={() => selectCourse(course.slug)}>
        {selected ? "Selected" : "Register"}
      </button>
      <a href={`/register/${course.slug}/`}>Direct page</a>
    </article>
  );
}

async function bootstrap() {
  await msalInstance.initialize();
  await msalInstance.handleRedirectPromise();
  const accounts = msalInstance.getAllAccounts();

  if (accounts[0]) {
    msalInstance.setActiveAccount(accounts[0]);
  }

  if (root) {
    createRoot(root).render(<App />);
  }
}

void bootstrap().catch((error) => {
  console.error("Registration page startup failed", error);
  if (root) {
    root.innerHTML = `<main class="registration-noscript"><section class="registration-card"><h1>Registration page failed to load</h1><p>Please refresh the page or contact ${TRAINING_MAILBOX}.</p></section></main>`;
  }
});
