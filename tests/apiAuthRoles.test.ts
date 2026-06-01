import { describe, expect, it } from "vitest";
import { hasPortalRole, portalRoleFromPrincipal } from "../api/auth";
import { config } from "../api/config";

describe("backend portal role checks", () => {
  it("matches Entra app role values case-insensitively within the Skunkworks tenant", () => {
    const principal = { tenantId: config.entraTenantId, roles: ["portal.staff"] };

    expect(hasPortalRole(principal, ["Portal.Staff"])).toBe(true);
    expect(hasPortalRole(principal, ["Portal.Admin"])).toBe(false);
  });

  it("does not trust matching role names from another tenant", () => {
    const principal = { tenantId: "external-tenant", roles: ["Portal.Admin"] };

    expect(hasPortalRole(principal, ["Portal.Admin", "Portal.Staff"])).toBe(false);
    expect(portalRoleFromPrincipal(principal)).toBe("Student");
  });

  it("maps admin and staff claims to the staff workspace", () => {
    expect(portalRoleFromPrincipal({ tenantId: config.entraTenantId, roles: ["Portal.Admin"] })).toBe("Staff");
    expect(portalRoleFromPrincipal({ tenantId: config.entraTenantId, roles: ["Portal.Staff"] })).toBe("Staff");
  });

  it("maps instructor claims and defaults everyone else to the student workspace", () => {
    expect(portalRoleFromPrincipal({ tenantId: config.entraTenantId, roles: ["Portal.Instructor"] })).toBe("Instructor");
    expect(portalRoleFromPrincipal({ tenantId: config.entraTenantId, roles: ["Portal.Student"] })).toBe("Student");
    expect(portalRoleFromPrincipal({ tenantId: config.entraTenantId, roles: [] })).toBe("Student");
  });
});
