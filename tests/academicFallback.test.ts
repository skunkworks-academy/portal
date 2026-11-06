import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("production-only Academy classes and enrolments", () => {
  const graph = readFileSync(new URL("../api/graph.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("../api/functions.ts", import.meta.url), "utf8");

  it("does not include fallback class records or materialise predefined cohorts", () => {
    expect(graph).not.toContain("fallbackData");
    expect(graph).not.toContain("fallbackClasses");
    expect(graph).not.toContain("ClassMaterialized");
    expect(graph).not.toContain("sameClassSession");
  });

  it("returns 404 for classes absent from SharePoint and 409 for closed classes", () => {
    const register = graph.slice(graph.indexOf("export async function registerForClass"));
    expect(register).toContain('throw new HttpError(404, "Class not found.")');
    expect(register).toContain('throw new HttpError(409, "Selected class is not open for registration.")');
    expect(register).toContain('item.id === classId');
    expect(register).not.toContain('createItem("ClassSessions"');
  });

  it("preserves authenticated registration, per-user idempotency and seat limits", () => {
    expect(server).toContain("await requireStudent(request)");
    const register = graph.slice(graph.indexOf("export async function registerForClass"), graph.indexOf("export async function createApplication"));
    expect(register).toContain("principal.subject");
    expect(register).toContain("if (existing.value[0]) return toClassRegistration");
    expect(register).toContain("classSession.enrolled >= classSession.seats");
    expect(register).toContain('Status: isFull ? "Waitlisted" : "Registered"');
  });
});
