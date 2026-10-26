import { describe, expect, it } from "vitest";
import { ACADEMY_SHAREPOINT_URL, getVisibleAcademyNavigation } from "../src/academy-workspace";

describe("Academy unified workspace", () => {
  it("provides the verified Academy SharePoint site as the document entry point", () => {
    expect(ACADEMY_SHAREPOINT_URL).toBe("https://bluemix944.sharepoint.com/sites/Academy");
  });

  it("does not expose staff-only modules to non-staff users", () => {
    const ids = getVisibleAcademyNavigation(false).map((item) => item.id);
    expect(ids).toContain("documents");
    expect(ids).toContain("classes");
    expect(ids).not.toContain("finance");
    expect(ids).not.toContain("people");
  });

  it("allows authorised staff to reach operational modules", () => {
    const ids = getVisibleAcademyNavigation(true).map((item) => item.id);
    expect(ids).toContain("finance");
    expect(ids).toContain("people");
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AcademyWorkspace } from "../src/academy-workspace";
import { PortalLanding } from "../src/landing-page";
import type { UserProfile } from "../src/types";

const instructor: UserProfile = {
  name: "Instructor User",
  username: "instructor@example.test",
  tenantId: "338a8916-80d9-467c-a94a-7f61d04ef7d5",
  roles: ["Portal.Instructor"],
  isAdmin: false,
  portalRole: "Instructor"
};

function renderWorkspace(profile: UserProfile) {
  return renderToStaticMarkup(createElement(AcademyWorkspace, {
    profile,
    role: profile.portalRole,
    courses: [],
    classes: [],
    jobs: [],
    applications: [],
    people: [],
    onManage: () => undefined,
    onSignOut: () => undefined
  }));
}

describe("Academy workspace server-side render and sign-in", () => {
  it("renders a prominent Microsoft Entra sign-in button before authentication", () => {
    const markup = renderToStaticMarkup(createElement(PortalLanding, { onSignIn: () => undefined }));
    expect(markup).toContain("Continue with Microsoft");
    expect(markup).toContain("Sign in to continue");
    expect(markup).not.toContain("Dashboard");
    expect(markup).not.toContain("Courses &amp; catalogues");
    expect(markup).not.toContain("Instructor opportunities");
    expect(markup).not.toContain("MY WORKSPACE");
    expect(markup).toContain("Microsoft Entra ID");
  });

  it("keeps the empty portal genuinely empty while linking the verified SharePoint site", () => {
    const markup = renderWorkspace(instructor);
    expect(markup).toContain("Catalogue records");
    expect(markup).toContain(">0</strong>");
    expect(markup).toContain(ACADEMY_SHAREPOINT_URL);
    expect(markup).not.toContain("AI Tools June Cohort");
  });

  it("only renders finance and people for verified staff", () => {
    const instructorMarkup = renderWorkspace(instructor);
    const verifiedStaffMarkup = renderWorkspace({ ...instructor, isAdmin: true, portalRole: "Staff", roles: ["Portal.Staff"] });
    const unverifiedStaffMarkup = renderWorkspace({ ...instructor, portalRole: "Staff" });
    expect(instructorMarkup).not.toContain("Finance &amp; reporting");
    expect(unverifiedStaffMarkup).not.toContain("Finance &amp; reporting");
    expect(verifiedStaffMarkup).toContain("Finance &amp; reporting");
    expect(verifiedStaffMarkup).toContain("People &amp; profiles");
  });
});


describe("signed-out HTML and navigation security regression", () => {
  it("contains no role previews, dashboards, or navigation before React loads", async () => {
    const { readFileSync } = await import("node:fs");
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html).toContain("Preparing your secure Microsoft sign-in");
    expect(html).not.toContain("Portal summary");
    expect(html).not.toContain("Staff Operations");
    expect(html).not.toContain('data-skunkworks-global-nav="v9"');
    expect(html).not.toContain('class="boot-panel"');
  });

  it("only loads the Academy application navigation after authentication", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
    expect(source).toContain("if (!isAuthenticated");
    expect(source).toContain("return isAuthenticated ? <SkunkieCompanion /> : null;");
  });

  it("preserves the existing Academy canonical brand and responsive design", async () => {
    const { readFileSync } = await import("node:fs");
    const markup = renderToStaticMarkup(createElement(PortalLanding, { onSignIn: () => undefined }));
    const css = readFileSync(new URL("../src/landing-page.css", import.meta.url), "utf8");
    expect(markup).toContain("https://www.skunkworksacademy.com/images/favicon-white.png");
    expect(markup).toContain("https://www.skunkworksacademy.com/images/favicon-black.png");
    expect(markup).toContain("Sign-in support");
    expect(css).toContain("@media(max-width:560px)");
    expect(css).toContain("@media(prefers-color-scheme:dark)");
    expect(css).toContain("var(--academy-accent,#1e6bd0)");
  });
});
