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
