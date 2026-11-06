import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isSkunkieConfigured, SKUNKIE_BUDGET_POLICY } from "../api/skunkieReadiness.js";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("Skunkie mobile recovery and production provider readiness", () => {
  it("is unavailable unless endpoint, deployment and server-only key are configured", () => {
    expect(isSkunkieConfigured({})).toBe(false);
    expect(isSkunkieConfigured({ AZURE_OPENAI_ENDPOINT: "https://academy.openai.azure.com", AZURE_OPENAI_DEPLOYMENT: "companion" })).toBe(false);
    expect(isSkunkieConfigured({ AZURE_OPENAI_ENDPOINT: "http://insecure", AZURE_OPENAI_DEPLOYMENT: "companion", AZURE_OPENAI_API_KEY: "test-secret" })).toBe(false);
    const configured = { AZURE_OPENAI_ENDPOINT: "https://academy.openai.azure.com/", AZURE_OPENAI_DEPLOYMENT: "companion", AZURE_OPENAI_API_KEY: "test-secret",
      SKUNKIE_BUDGET_POLICY, LMS_COSMOS_ENDPOINT: "https://test.documents.azure.com/", LMS_COSMOS_DATABASE: "academy", LMS_COSMOS_CONTAINER: "lms", LMS_HOME_ORGANIZATION_ID: "academy" };
    expect(isSkunkieConfigured(configured)).toBe(true);
    expect(isSkunkieConfigured({ ...configured, SKUNKIE_BUDGET_POLICY: undefined })).toBe(false);
    expect(isSkunkieConfigured({ ...configured, LMS_COSMOS_ENDPOINT: undefined })).toBe(false);
    expect(isSkunkieConfigured({ ...configured, AZURE_OPENAI_ENDPOINT: "https://attacker.example/" })).toBe(false);
  });

  it("registers both the existing chat API and authenticated availability check", () => {
    const entry = source("../api/entrypoint.ts");
    const funcs = source("../api/functions.ts");
    const skunkie = source("../api/skunkieFunctions.ts");
    expect(entry).toContain('import "./functions.js"');
    expect(funcs).toContain('import "./skunkieFunctions.js"');
    expect(funcs).toContain('"GET /api/skunkie/status"');
    expect(skunkie).toContain('route: "skunkie/status"');
    expect(skunkie).toContain('route: "skunkie/chat"');
    expect(skunkie).toContain("authenticate: requireUser");
    expect(skunkie).toContain("await dependencies.authenticate(request)");
    expect(skunkie).toContain("isSkunkieConfigured(settings)");
    expect(skunkie).not.toContain("upstreamBody.slice");
    expect(skunkie).not.toContain("user: principal.email");
  });

  it("keeps composer text on failure rather than adding fabricated AI replies", () => {
    const widget = source("../src/SkunkieCompanion.tsx");
    expect(widget).toContain("setChatError(reason)");
    expect(widget).toContain("history: messages.slice(-8)");
    expect(widget).toContain('role="alert"');
    expect(widget).toContain('aria-label="Close Skunkie"');
    expect(widget).toContain("onEscape");
    expect(widget).toContain('setInput(value => value.trim() === message ? "" : value)');
    expect(widget).not.toContain("I can’t reach the learning service right now");
    expect(widget).toContain('"configured" | "ready" | "unavailable"');
  });

  it("bounds the mobile chat to the visual viewport and retains composer controls", () => {
    const css = source("../src/skunkie-companion.css");
    expect(css).toContain("calc(100dvh - 180px");
    expect(css).toContain("width:min(360px,calc(100vw - 24px))");
    expect(css).toContain("overflow-y:auto");
    expect(css).toContain("grid-template-columns:minmax(0,1fr) auto");
    expect(css).toContain(".skunkie__status--unavailable");
  });

  it("restores configured Azure AI credentials as server-side GitHub production secrets", () => {
    const workflow = source("../.github/workflows/deploy-azure-function.yml");
    const frontend = source("../src/SkunkieCompanion.tsx");
    expect(workflow).toContain("secrets.PORTAL_AZURE_OPENAI_API_KEY");
    expect(workflow).toContain("vars.PORTAL_AZURE_OPENAI_ENDPOINT");
    expect(workflow).toContain("vars.PORTAL_AZURE_OPENAI_DEPLOYMENT");
    expect(workflow).toContain('GET /api/skunkie/status');
    expect(frontend).not.toContain("AZURE_OPENAI_API_KEY");
  });
});
