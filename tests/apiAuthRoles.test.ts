import { describe, expect, it } from "vitest";
import { hasPortalRole, portalRoleFromPrincipal, validatePortalTokenClaims } from "../api/auth";
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

describe("Multi-tenant learner token claim validation", () => {
  const externalTenant = "a1234567-b890-4cde-8f01-23456789abcd";
  const consumerTenant = "9188040d-6c67-4c5b-b112-36a304b66dad";
  function claims(tid: string) {
    return {
      tid,
      iss: `https://login.microsoftonline.com/${tid}/v2.0`,
      ver: "2.0",
      scp: "openid profile access_as_user",
      oid: "12345678-1234-4234-8234-123456789abc"
    };
  }

  it("accepts delegated access from organisational and personal Microsoft users", () => {
    expect(validatePortalTokenClaims(claims(externalTenant)).tenantId).toBe(externalTenant);
    expect(validatePortalTokenClaims(claims(consumerTenant)).tenantId).toBe(consumerTenant);
  });

  it("partitions external user IDs by tenant while preserving existing home-tenant IDs", () => {
    expect(validatePortalTokenClaims(claims(config.entraTenantId)).subject).toBe(claims(config.entraTenantId).oid);
    expect(validatePortalTokenClaims(claims(externalTenant)).subject).toBe(
      `${externalTenant}:${claims(externalTenant).oid}`
    );
    expect(validatePortalTokenClaims(claims(consumerTenant)).subject).not.toBe(
      validatePortalTokenClaims(claims(externalTenant)).subject
    );
  });

  it("rejects malformed tenant claims, mismatched issuers and app-only tokens", () => {
    expect(() => validatePortalTokenClaims(claims("not-a-guid"))).toThrow();
    expect(() => validatePortalTokenClaims({ ...claims(externalTenant), iss: "https://attacker.invalid" })).toThrow();
    expect(() => validatePortalTokenClaims({ ...claims(externalTenant), tid: config.entraTenantId })).toThrow();
    expect(() => validatePortalTokenClaims({ ...claims(externalTenant), scp: "User.Read" })).toThrow();
    expect(() => validatePortalTokenClaims({ ...claims(externalTenant), ver: "1.0" })).toThrow();
    expect(() => validatePortalTokenClaims({ ...claims(externalTenant), oid: undefined, sub: undefined })).toThrow();
  });

  it("does not treat external tenant roles as Academy privileges", () => {
    const external = { tenantId: externalTenant, roles: ["Portal.Admin", "Portal.Staff", "Portal.Instructor"] };
    expect(hasPortalRole(external, ["Portal.Admin", "Portal.Staff", "Portal.Instructor"])).toBe(false);
    expect(portalRoleFromPrincipal(external)).toBe("Student");
  });
});
