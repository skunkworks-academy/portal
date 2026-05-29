import { describe, expect, it } from "vitest";
import { canAccess, roleDefinitions, type Tab } from "../src/roles";
import type { PortalRole } from "../src/types";

const forbiddenTabs: Record<PortalRole, Tab[]> = {
  Student: ["jobs", "applications", "staff"],
  Instructor: ["courses", "register", "staff"],
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

  it("allows staff operations only to staff role or admin users", () => {
    expect(canAccess("Student", "staff", false)).toBe(false);
    expect(canAccess("Instructor", "staff", false)).toBe(false);
    expect(canAccess("Student", "staff", true)).toBe(true);
    expect(canAccess("Staff", "staff", false)).toBe(true);
  });
});
