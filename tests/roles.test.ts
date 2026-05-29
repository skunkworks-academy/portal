import { describe, expect, it } from "vitest";
import { canAccess, roleDefinitions, roleFromClaims, type Tab } from "../src/roles";
import type { PortalRole } from "../src/types";

const forbiddenTabs: Record<PortalRole, Tab[]> = {
  Student: ["jobs", "applications", "staff", "instructors", "students", "settings"],
  Instructor: ["courses", "register", "staff", "instructors", "students", "settings"],
  Staff: ["courses", "register"]
};

describe("role access configuration", () => {
  it("only exposes configured navigation tabs for each role", () => {
    for (const role of Object.keys(roleDefinitions) as PortalRole[]) {
      for (const item of roleDefinitions[role].nav) {
        expect(canAccess(role, item.tab, role === "Staff")).toBe(true);
      }
    }
  });

  it("blocks cross-role tabs that should not be visible", () => {
    for (const role of Object.keys(forbiddenTabs) as PortalRole[]) {
      for (const tab of forbiddenTabs[role]) {
        expect(canAccess(role, tab, false)).toBe(false);
      }
    }
  });

  it("allows staff monitoring tabs only to staff role or admin users", () => {
    for (const tab of ["staff", "instructors", "students", "settings"] as Tab[]) {
      expect(canAccess("Student", tab, false)).toBe(false);
      expect(canAccess("Instructor", tab, false)).toBe(false);
      expect(canAccess("Student", tab, true)).toBe(true);
      expect(canAccess("Staff", tab, false)).toBe(true);
    }
  });

  it("resolves workspaces from Entra app roles with student as the least-privilege default", () => {
    expect(roleFromClaims([], false)).toBe("Student");
    expect(roleFromClaims(["Portal.Student"], false)).toBe("Student");
    expect(roleFromClaims(["Portal.Instructor"], false)).toBe("Instructor");
    expect(roleFromClaims(["Portal.Staff"], true)).toBe("Staff");
    expect(roleFromClaims(["Portal.Admin"], true)).toBe("Staff");
  });
});
