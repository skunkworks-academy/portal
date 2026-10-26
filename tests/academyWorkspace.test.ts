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
    expect(markup).toContain("Sign in with Microsoft");
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
