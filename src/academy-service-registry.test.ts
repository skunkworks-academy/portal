import { describe, expect, it } from "vitest";
import { academyServiceRegistry, hasConfiguredAcademyService, linkedAcademyServices } from "./academy-service-registry";

describe("Academy service registry", () => {
  it("keeps planned modules unlinked rather than inventing production URLs", () => {
    const planned = academyServiceRegistry.filter(service => service.status === "planned");
    expect(planned.length).toBeGreaterThan(0);
    expect(planned.every(service => service.href === null)).toBe(true);
    expect(hasConfiguredAcademyService("community")).toBe(false);
  });

  it("provides unique, HTTPS-only configured destinations", () => {
    expect(new Set(academyServiceRegistry.map(service => service.id)).size).toBe(academyServiceRegistry.length);
    expect(linkedAcademyServices().every(service => service.href?.startsWith("https://"))).toBe(true);
  });

  it("includes vendor, career, badging and lab destinations without treating them as free entitlements", () => {
    const ids = linkedAcademyServices().map(service => service.id);
    expect(ids).toEqual(expect.arrayContaining(["ibm", "google", "microsoft", "comptia", "career-development", "badging", "labs"]));
    expect(linkedAcademyServices().find(service => service.id === "labs")?.access).toBe("entitlement-required");
    expect(linkedAcademyServices("Vendor catalogues")).toHaveLength(4);
  });
});
