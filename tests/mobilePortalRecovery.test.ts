import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StudentExperience } from "../src/student-experience";
import type { UserProfile } from "../src/types";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const student: UserProfile = {
  name: "Real Learner",
  username: "learner@example.test",
  tenantId: "9188040d-6c67-4c5b-b112-36a304b66dad",
  roles: [],
  isAdmin: false,
  portalRole: "Student"
};

describe("Portal mobile sign-in and student data integrity", () => {
  it("keeps signed-in dashboard values grounded in actual records", () => {
    const html = renderToStaticMarkup(createElement(StudentExperience, {
      profile: student,
      portalProfile: { displayName: "Real Learner", portalRole: "Student", phone: "", location: "", bio: "", cvFileName: "" },
      courses: [],
      classes: [],
      registrations: [],
      onSignIn: () => undefined,
      onSignOut: () => undefined,
      onRegister: async () => undefined
    }));
    expect(html).toContain("0");
    expect(html).toContain("class registrations");
    expect(html).toContain("Learning progress appears after verified course activity");
    expect(html).not.toContain("42%");
    expect(html).not.toContain("5 days");
    expect(html).not.toContain("Cloud foundations study group");
  });

  it("never seeds fake messages, class streaks, simulated AI replies or fabricated progress", () => {
    const source = read("../src/student-experience.tsx");
    expect(source).not.toContain('value="5 days"');
    expect(source).not.toContain("learningProgress = courses.length");
    expect(source).not.toContain("const messages = [");
    expect(source).not.toContain("Great question. I’ll use your current course");
    expect(source).toContain("No messages yet");
  });

  it("keeps browser redirect errors recoverable without exposing the dashboard", () => {
    const source = read("../src/main.tsx");
    expect(source).toContain("await msalInstance.handleRedirectPromise()");
    expect(source).toContain('startupNotice = "Microsoft sign-in could not finish');
    expect(source).toContain("<App startupNotice={startupNotice} />");
    expect(source).toContain("if (activeAccount)");
    expect(source).toContain("renderStartupError(error)");
    const landing = read("../src/landing-page.tsx");
    expect(landing).toContain("role=\"alert\"");
    expect(landing).toContain("setRedirecting(false)");
  });

  it("uses high-contrast Academy navy/blue and accessible mobile layout", () => {
    const css = read("../src/student-experience.css");
    expect(css).toContain("background:linear-gradient(125deg,#03033a");
    expect(css).toContain(".student-hero-card :is(h2,p){color:#fff}");
    expect(css).toContain(".student-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}");
    expect(css).toContain("@media(max-width:520px)");
  });
});
