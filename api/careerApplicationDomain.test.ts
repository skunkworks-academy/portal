import { describe, expect, it } from "vitest";
import { validateCareerCreate, validateCareerId, validateCareerStatus } from "./careerApplicationDomain.js";

describe("learner career application validation", () => {
  it("accepts a legitimate opportunity", () => {
    expect(validateCareerCreate({ title: "Junior Engineer", employer: "Acme", url: "https://example.org/jobs/1" }))
      .toEqual({ title: "Junior Engineer", employer: "Acme", url: "https://example.org/jobs/1" });
  });
  it("never accepts user-selected record ownership, scripts or insecure URLs", () => {
    expect(() => validateCareerCreate({ title: "Analyst", employer: "Acme", ownerId: "other-user" })).toThrow();
    expect(() => validateCareerCreate({ title: "Analyst", employer: "Acme", url: "javascript:alert(1)" })).toThrow();
    expect(() => validateCareerCreate({ title: "Analyst", employer: "Acme", url: "http://example.org/job" })).toThrow();
    expect(() => validateCareerCreate({ title: "", employer: "Acme" })).toThrow();
  });
  it("accepts only defined status transitions and UUID record IDs", () => {
    expect(validateCareerStatus({ status: "Interview" })).toBe("Interview");
    expect(() => validateCareerStatus({ status: "Hired", admin: true })).toThrow();
    expect(() => validateCareerStatus({ status: "Hired" })).toThrow();
    expect(validateCareerId("a4a45555-2222-4222-8222-123456789abc")).toBe("a4a45555-2222-4222-8222-123456789abc");
    expect(() => validateCareerId("../other-user")).toThrow();
  });
});
