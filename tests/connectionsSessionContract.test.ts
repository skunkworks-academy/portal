import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const connections = readFileSync(resolve(process.cwd(), "connections/assets/app.js"), "utf8");
const bff = readFileSync(resolve(process.cwd(), "api/identityBff.ts"), "utf8");

describe("Connections canonical session consumer", () => {
  it("consumes the actual immutable subject field returned by the Entra BFF", () => {
    expect(bff).toContain("subject: string;");
    expect(connections).toContain("session?.subject");
    expect(connections).not.toContain("session?.subject_id");
    expect(connections).toContain("session?.authenticated !== true");
  });

  it("requires a no-store same-origin session response without accepting HTML or browser tokens", () => {
    expect(connections).toContain("fetch('/session'");
    expect(connections).toContain("credentials:'same-origin'");
    expect(connections).toContain("cache:'no-store'");
    expect(connections).toContain("content-type");
    expect(connections).not.toContain("localStorage.getItem('skw_access_token')");
    expect(connections).not.toContain("sessionStorage.getItem('skw_access_token')");
  });

  it("uses only recognised roles for presentation-level workspace labels", () => {
    expect(connections).toContain("roles.includes('administrator')");
    expect(connections).toContain("roles.includes('instructor')");
    expect(connections).toContain("roles.includes('learner')");
    expect(connections).toContain("Open Portal");
  });
});
