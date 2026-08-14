import { useMemo, useState } from "react";
import type { ClassRegistrationRecord, ClassSession, CourseRecord, PortalProfileInput, UserProfile } from "./types";
import "./student-experience.css";

type StudentView = "dashboard" | "learning" | "classes" | "achievements" | "resources" | "messages" | "companion" | "profile";

type StudentExperienceProps = {
  profile: UserProfile | null;
  portalProfile: PortalProfileInput;
  courses: CourseRecord[];
  classes: ClassSession[];
  registrations: ClassRegistrationRecord[];
  onSignIn: () => void;
  onSignOut: () => void;
  onRegister: (classId: string) => Promise<void>;
};

const navItems: Array<{ id: StudentView; label: string; icon: string }> = [
  { id: "dashboard", label: "Dashboard", icon: "⌂" },
  { id: "learning", label: "My learning", icon: "◈" },
  { id: "classes", label: "Classes", icon: "◫" },
  { id: "achievements", label: "Achievements", icon: "✦" },
  { id: "resources", label: "Resources", icon: "▤" },
  { id: "messages", label: "Messages", icon: "✉" },
  { id: "companion", label: "AI Companion", icon: "✺" },
  { id: "profile", label: "Profile & settings", icon: "◌" }
];

const resources = [
  { title: "Azure overview", type: "Microsoft Learn", detail: "A concise entry point for cloud concepts and services.", href: "https://learn.microsoft.com/training/azure/" },
  { title: "Virtual machines lab", type: "Hands-on lab", detail: "Practise provisioning and managing an Azure virtual machine.", href: "https://learn.microsoft.com/training/" },
  { title: "Exam revision checklist", type: "Download", detail: "Use this checklist to structure your revision time.", href: "https://skunkworksacademy.com/self-paced/" }
];

const messages = [
  { id: "class", title: "New class added: Cloud foundations", meta: "Today · Action available", body: "A Cloud foundations study group is now available this Thursday at 18:00. Reserve your space from the Classes page." },
  { id: "plan", title: "Your learning plan is ready", meta: "Yesterday", body: "Your recommended pathway is ready. Start with Azure Fundamentals and set a weekly study goal." },
  { id: "welcome", title: "Welcome to Skunkworks Academy", meta: "2 days ago", body: "Your learner workspace is ready. Explore courses, classes, resources and your AI Learning Companion." }
];

export function StudentExperience({
  profile,
  portalProfile,
  courses,
  classes,
  registrations,
  onSignIn,
  onSignOut,
  onRegister
}: StudentExperienceProps) {
  const [view, setView] = useState<StudentView>("dashboard");
  const [query, setQuery] = useState("");
  const [selectedMessage, setSelectedMessage] = useState(messages[0]);
  const [prompt, setPrompt] = useState("");
  const [chat, setChat] = useState<Array<{ author: "Skunkie" | "You"; text: string }>>([
    { author: "Skunkie", text: "Hi! I’m Skunkie, your learning companion. I can explain a concept, help you plan study time, or quiz you on a course." }
  ]);

  const displayName = portalProfile.displayName || profile?.name || "Learner";
  const registeredClassIds = useMemo(() => new Set(registrations.map((registration) => registration.classId)), [registrations]);
  const filteredCourses = useMemo(
    () => courses.filter((course) => `${course.title} ${course.description} ${course.level}`.toLowerCase().includes(query.trim().toLowerCase())),
    [courses, query]
  );
  const firstCourse = courses[0];
  const nextClass = classes.find((classItem) => registeredClassIds.has(classItem.id)) ?? classes[0];
  const learningProgress = courses.length ? Math.min(82, 18 + registrations.length * 12 + courses.length * 8) : 0;

  function sendPrompt(value = prompt) {
    const text = value.trim();
    if (!text) return;
    setChat((current) => [
      ...current,
      { author: "You", text },
      { author: "Skunkie", text: "Great question. I’ll use your current course context to give you a clear next step. Try breaking the topic into one concept, one practical example, and one quick self-check." }
    ]);
    setPrompt("");
  }

  return (
    <div className="student-shell">
      <a className="skip-link" href="#student-main">Skip to student content</a>
      <aside className="student-sidebar" aria-label="Student navigation">
        <a className="student-brand" href="https://skunkworksacademy.com/" aria-label="Skunkworks Academy home">
          <span className="student-brand-mark" aria-hidden="true">
            <img className="academy-menu-icon academy-menu-icon--dark" src="https://raw.githubusercontent.com/skunkworks-academy/www/refs/heads/main/images/favicon-white.png" alt="" />
            <img className="academy-menu-icon academy-menu-icon--light" src="https://raw.githubusercontent.com/skunkworks-academy/www/refs/heads/main/images/favicon-black.png" alt="" />
          </span>
          <span><strong>Skunkworks</strong><small>Academy · Student</small></span>
        </a>
        <nav className="student-nav">
          {navItems.map((item) => (
            <button
              type="button"
              key={item.id}
              className={view === item.id ? "student-nav-item active" : "student-nav-item"}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
            >
              <span aria-hidden="true">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="student-sidebar-footer">
          <button type="button" className="student-profile-link" onClick={() => setView("profile")}>
            <span className="student-avatar" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>
            <span><strong>{displayName}</strong><small>Student account</small></span>
          </button>
          {profile ? <button type="button" className="student-signout" onClick={onSignOut}>Sign out</button> : <button type="button" className="student-signout" onClick={onSignIn}>Sign in</button>}
        </div>
      </aside>

      <section className="student-workspace">
        <header className="student-topbar">
          <div>
            <p className="student-kicker">Student Portal</p>
            <h1>{view === "dashboard" ? `Welcome back, ${displayName.split(" ")[0]}` : navItems.find((item) => item.id === view)?.label}</h1>
          </div>
          <label className="student-search">
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search courses and resources" aria-label="Search courses and resources" />
          </label>
        </header>

        <main id="student-main" className="student-main">
          {!profile && (
            <section className="student-signin-banner">
              <div><strong>Unlock your personal learning space.</strong><span>Sign in to save registrations, learning progress, and profile preferences.</span></div>
              <button type="button" onClick={onSignIn}>Sign in with Microsoft</button>
            </section>
          )}

          {view === "dashboard" && (
            <section className="student-view student-dashboard-view" aria-label="Student dashboard">
              <div className="student-hero-card">
                <div>
                  <p className="student-kicker">Your study plan</p>
                  <h2>Small, consistent sessions build real confidence.</h2>
                  <p>Continue where you left off, reserve a class, or ask Skunkie to make today’s study plan.</p>
                  <div className="student-action-row">
                    <button type="button" onClick={() => setView("learning")}>Continue learning</button>
                    <button type="button" className="student-secondary-action" onClick={() => setView("companion")}>Ask Skunkie</button>
                  </div>
                </div>
                <div className="student-progress-orbit" aria-label={`${learningProgress}% weekly progress`}>
                  <strong>{learningProgress}%</strong><span>weekly goal</span>
                </div>
              </div>
              <div className="student-stat-grid">
                <Stat value={courses.length} label="Available courses" />
                <Stat value={registrations.length} label="Class registrations" />
                <Stat value="5 days" label="Learning streak" />
              </div>
              <div className="student-two-column">
                <article className="student-panel">
                  <div className="student-panel-heading"><div><p className="student-kicker">Next up</p><h2>{firstCourse?.title ?? "Choose a course"}</h2></div><button type="button" className="student-text-button" onClick={() => setView("learning")}>View learning</button></div>
                  <p>{firstCourse?.description ?? "Explore the Academy catalogue to begin your learning pathway."}</p>
                  <div className="student-linear-progress"><span style={{ width: `${learningProgress}%` }} /></div>
                  <span className="student-muted">{learningProgress}% of your current study target</span>
                </article>
                <article className="student-panel student-next-class">
                  <div className="student-panel-heading"><div><p className="student-kicker">Classes</p><h2>{nextClass?.title ?? "No class scheduled"}</h2></div><button type="button" className="student-text-button" onClick={() => setView("classes")}>View classes</button></div>
                  <p>{nextClass ? `${nextClass.schedule} · ${nextClass.modality}` : "Register for an upcoming study group or live session."}</p>
                  <span className="student-muted">{nextClass ? `${nextClass.enrolled}/${nextClass.seats} seats reserved` : "Your schedule is clear."}</span>
                </article>
              </div>
            </section>
          )}

          {view === "learning" && (
            <section className="student-view" aria-label="My learning">
              <div className="student-section-heading"><div><p className="student-kicker">Learning library</p><h2>Choose your next learning step</h2><p>Courses are tailored to practical skills, labs, and certification preparation.</p></div><span className="student-count">{filteredCourses.length} courses</span></div>
              <div className="student-course-grid">
                {filteredCourses.map((course, index) => <CourseCard key={course.id} course={course} progress={index === 0 ? learningProgress : 0} onContinue={() => setView("companion")} />)}
              </div>
            </section>
          )}

          {view === "classes" && (
            <section className="student-view" aria-label="Classes">
              <div className="student-section-heading"><div><p className="student-kicker">Live learning</p><h2>Classes and study sessions</h2><p>Register for a session and it will appear in your personal schedule.</p></div></div>
              <div className="student-session-list">
                {classes.map((classItem) => {
                  const registered = registeredClassIds.has(classItem.id);
                  return <article className="student-session-card" key={classItem.id}><div className="student-session-date"><strong>{classItem.schedule}</strong><span>{classItem.modality}</span></div><div><span className="student-status">{classItem.status}</span><h2>{classItem.title}</h2><p>{classItem.courseTitle} · {classItem.instructor}</p><small>{classItem.enrolled}/{classItem.seats} places reserved</small></div><button type="button" disabled={registered} onClick={() => void onRegister(classItem.id)}>{registered ? "Registered" : "Register"}</button></article>;
                })}
              </div>
            </section>
          )}

          {view === "achievements" && <Achievements courseCount={courses.length} registrationCount={registrations.length} onViewLearning={() => setView("learning")} />}
          {view === "resources" && <Resources />}
          {view === "messages" && <Messages selected={selectedMessage.id} onSelect={setSelectedMessage} />}
          {view === "companion" && <Companion chat={chat} prompt={prompt} onPrompt={setPrompt} onSend={sendPrompt} />}
          {view === "profile" && <ProfileSettings displayName={displayName} portalProfile={portalProfile} courseCount={courses.length} registrations={registrations.length} />}
        </main>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return <article className="student-stat"><strong>{value}</strong><span>{label}</span></article>;
}

function CourseCard({ course, progress, onContinue }: { course: CourseRecord; progress: number; onContinue: () => void }) {
  return <article className="student-course-card">
    <div className="student-course-art" aria-hidden="true"><span>{course.level}</span></div>
    <div className="student-course-copy"><span className="student-status">{course.status}</span><h2>{course.title}</h2><p>{course.description}</p><small>{course.duration}</small>{progress > 0 && <div className="student-linear-progress"><span style={{ width: `${progress}%` }} /></div>}<button type="button" className="student-text-button" onClick={onContinue}>{progress > 0 ? "Continue course" : "Explore course"} →</button></div>
  </article>;
}

function Achievements({ courseCount, registrationCount, onViewLearning }: { courseCount: number; registrationCount: number; onViewLearning: () => void }) {
  return <section className="student-view" aria-label="Achievements"><div className="student-section-heading"><div><p className="student-kicker">Your milestones</p><h2>Achievements and credentials</h2><p>Verified certificates and badges will appear here as you complete Academy learning.</p></div></div><div className="student-achievement-grid"><Achievement icon="✦" title="Learning journey" detail={`${courseCount} course options ready for you.`} /><Achievement icon="◫" title="Class commitment" detail={registrationCount ? `${registrationCount} registered session${registrationCount === 1 ? "" : "s"}.` : "Register for a study session to get started."} /><Achievement icon="◌" title="Credential pathway" detail="Complete a pathway to unlock shareable evidence of learning." /></div><article className="student-empty-state"><span>✦</span><div><h2>Your next achievement is close</h2><p>Complete a course module and return here to see your learning milestones grow.</p></div><button type="button" onClick={onViewLearning}>View learning</button></article></section>;
}

function Achievement({ icon, title, detail }: { icon: string; title: string; detail: string }) { return <article className="student-achievement"><span aria-hidden="true">{icon}</span><h2>{title}</h2><p>{detail}</p></article>; }

function Resources() {
  return <section className="student-view" aria-label="Resources"><div className="student-section-heading"><div><p className="student-kicker">Study support</p><h2>Resources worth saving</h2><p>Labs, notes, and learning links that support your active courses.</p></div></div><div className="student-resource-list">{resources.map((resource) => <a key={resource.title} href={resource.href} className="student-resource-card"><span>{resource.type}</span><div><h2>{resource.title}</h2><p>{resource.detail}</p></div><strong aria-hidden="true">→</strong></a>)}</div></section>;
}

function Messages({ selected, onSelect }: { selected: string; onSelect: (message: typeof messages[number]) => void }) {
  const active = messages.find((message) => message.id === selected) ?? messages[0];
  return <section className="student-view student-message-layout" aria-label="Messages"><div className="student-message-list">{messages.map((message) => <button type="button" key={message.id} className={selected === message.id ? "student-message-row active" : "student-message-row"} onClick={() => onSelect(message)}><strong>{message.title}</strong><span>{message.meta}</span></button>)}</div><article className="student-message-detail"><p className="student-kicker">{active.meta}</p><h2>{active.title}</h2><p>{active.body}</p><button type="button" className="student-secondary-action">Mark as read</button></article></section>;
}

function Companion({ chat, prompt, onPrompt, onSend }: { chat: Array<{ author: "Skunkie" | "You"; text: string }>; prompt: string; onPrompt: (value: string) => void; onSend: (value?: string) => void }) {
  const suggestions = ["Quiz me on this course", "Explain Azure RBAC simply", "Build a 30-minute study plan"];
  return <section className="student-view student-companion-view" aria-label="AI Learning Companion"><div className="student-companion-header"><div className="student-skunkie-avatar" aria-hidden="true">S</div><div><p className="student-kicker">AI Learning Companion</p><h2>Skunkie is ready to learn with you</h2><span>Private learning guidance · Uses your selected course context</span></div></div><div className="student-chat-log" aria-live="polite">{chat.map((message, index) => <article key={`${message.author}-${index}`} className={message.author === "You" ? "student-chat-message mine" : "student-chat-message"}><strong>{message.author}</strong><p>{message.text}</p></article>)}</div><div className="student-prompt-suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => onSend(suggestion)}>{suggestion}</button>)}</div><div className="student-composer"><label><span className="visually-hidden">Ask Skunkie</span><textarea value={prompt} onChange={(event) => onPrompt(event.target.value)} placeholder="Ask Skunkie about this course, a lab, or your study plan…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); onSend(); } }} /></label><button type="button" onClick={() => onSend()} disabled={!prompt.trim()}>Send</button></div></section>;
}

function ProfileSettings({ displayName, portalProfile, courseCount, registrations }: { displayName: string; portalProfile: PortalProfileInput; courseCount: number; registrations: number }) {
  return <section className="student-view" aria-label="Profile and settings"><div className="student-section-heading"><div><p className="student-kicker">Your account</p><h2>Profile and settings</h2><p>Keep your learner details and study preferences up to date.</p></div></div><div className="student-profile-grid"><article className="student-profile-card"><span className="student-avatar large" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span><h2>{displayName}</h2><p>{portalProfile.location || "Add your location"} · Student</p><dl><div><dt>Courses</dt><dd>{courseCount}</dd></div><div><dt>Classes</dt><dd>{registrations}</dd></div></dl></article><article className="student-settings-card"><Setting label="Learning reminders" value="On" /><Setting label="Weekly learning goal" value="6 hours" /><Setting label="Privacy and data controls" value="Manage" /><Setting label="Accessibility preferences" value="Manage" /></article></div></section>;
}

function Setting({ label, value }: { label: string; value: string }) { return <div className="student-setting"><span>{label}</span><button type="button">{value}</button></div>; }
